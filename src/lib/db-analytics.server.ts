import { NeonDbError } from "@neondatabase/serverless";
import { sql } from "@/lib/neon.server";
import type { CleanAttribution, CleanEvent } from "@/lib/analytics-events-schema";

// Postgres "undefined_column": the analytics attribution migration
// (neon/migrations/024_analytics_attribution.sql) has not been applied to this
// database. Writers then fall back to the original column list, so tracking
// never breaks — it just records less.
const isMissingColumn = (e: unknown) => e instanceof NeonDbError && e.code === "42703";

const NO_ATTRIBUTION: CleanAttribution = {
  first_source: null,
  first_medium: null,
  first_campaign: null,
  first_content: null,
  first_term: null,
  last_source: null,
  last_medium: null,
  last_campaign: null,
  last_content: null,
  last_term: null,
};

export async function logVisitToDb(input: {
  visitor_id: string;
  session_id: string;
  path: string;
  referrer: string;
  source: string;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  country_code: string | null;
  city: string | null;
  governorate: string | null;
  user_agent: string;
  host?: string | null;
  attribution?: CleanAttribution;
}): Promise<void> {
  const a = input.attribution ?? NO_ATTRIBUTION;
  try {
    await sql()`
      insert into analytics_visits (
        visitor_id, session_id, path, referrer, source, device, browser, os,
        country, country_code, city, governorate, user_agent,
        host, first_source, first_medium, first_campaign, first_content, first_term,
        last_source, last_medium, last_campaign, last_content, last_term
      ) values (
        ${input.visitor_id}, ${input.session_id}, ${input.path}, ${input.referrer}, ${input.source},
        ${input.device}, ${input.browser}, ${input.os}, ${input.country}, ${input.country_code},
        ${input.city}, ${input.governorate}, ${input.user_agent},
        ${input.host ?? null}, ${a.first_source}, ${a.first_medium}, ${a.first_campaign}, ${a.first_content}, ${a.first_term},
        ${a.last_source}, ${a.last_medium}, ${a.last_campaign}, ${a.last_content}, ${a.last_term}
      )
    `;
  } catch (e) {
    if (!isMissingColumn(e)) throw e;
    await sql()`
      insert into analytics_visits (
        visitor_id, session_id, path, referrer, source, device, browser, os,
        country, country_code, city, governorate, user_agent
      ) values (
        ${input.visitor_id}, ${input.session_id}, ${input.path}, ${input.referrer}, ${input.source},
        ${input.device}, ${input.browser}, ${input.os}, ${input.country}, ${input.country_code},
        ${input.city}, ${input.governorate}, ${input.user_agent}
      )
    `;
  }
}

export type EventBatch = {
  visitor_id: string;
  session_id: string;
  host: string | null;
  attribution: CleanAttribution;
  events: Array<CleanEvent & { duration_seconds?: number | null }>;
};

/**
 * One round trip for a whole batch. poster_id is resolved against posters so a
 * deleted/unknown poster stores NULL instead of failing the entire batch on the
 * foreign key.
 */
export async function logEventsToDb(batch: EventBatch): Promise<void> {
  if (batch.events.length === 0) return;
  const a = batch.attribution;
  const rows = batch.events.map((e) => ({
    poster_id: e.poster_id,
    visitor_id: batch.visitor_id,
    session_id: batch.session_id,
    event_type: e.event_type,
    duration_seconds: e.duration_seconds ?? null,
    host: batch.host,
    path: e.path,
    value: e.value,
    quantity: e.quantity,
    props: e.props,
    first_source: a.first_source,
    first_medium: a.first_medium,
    first_campaign: a.first_campaign,
    last_source: a.last_source,
    last_medium: a.last_medium,
    last_campaign: a.last_campaign,
  }));
  const json = JSON.stringify(rows);
  try {
    await sql()`
      insert into analytics_poster_events (
        poster_id, visitor_id, session_id, event_type, duration_seconds,
        host, path, value, quantity, props,
        first_source, first_medium, first_campaign, last_source, last_medium, last_campaign
      )
      select (select p.id from posters p where p.id = x.poster_id),
             x.visitor_id, x.session_id, x.event_type, x.duration_seconds,
             x.host, x.path, x.value, x.quantity, x.props,
             x.first_source, x.first_medium, x.first_campaign, x.last_source, x.last_medium, x.last_campaign
      from jsonb_to_recordset(${json}::jsonb) as x(
        poster_id uuid, visitor_id text, session_id text, event_type text, duration_seconds integer,
        host text, path text, value numeric, quantity integer, props jsonb,
        first_source text, first_medium text, first_campaign text,
        last_source text, last_medium text, last_campaign text
      )
    `;
  } catch (e) {
    if (!isMissingColumn(e)) throw e;
    await sql()`
      insert into analytics_poster_events (poster_id, visitor_id, session_id, event_type, duration_seconds)
      select (select p.id from posters p where p.id = x.poster_id),
             x.visitor_id, x.session_id, x.event_type, x.duration_seconds
      from jsonb_to_recordset(${json}::jsonb) as x(
        poster_id uuid, visitor_id text, session_id text, event_type text, duration_seconds integer
      )
    `;
  }
}

/** Single legacy-shaped event (view / cart_add / wishlist_add / checkout_start). */
export async function logPosterEventToDb(input: {
  poster_id: string | null;
  visitor_id: string;
  session_id: string;
  event_type: string;
  duration_seconds: number | null;
  host?: string | null;
  path?: string | null;
  attribution?: CleanAttribution;
}): Promise<void> {
  await logEventsToDb({
    visitor_id: input.visitor_id,
    session_id: input.session_id,
    host: input.host ?? null,
    attribution: input.attribution ?? NO_ATTRIBUTION,
    events: [
      {
        event_type: input.event_type,
        poster_id: input.poster_id,
        value: null,
        quantity: null,
        props: null,
        path: input.path ?? null,
        duration_seconds: input.duration_seconds,
      },
    ],
  });
}

export async function logSearchQueryToDb(input: {
  query: string;
  results_count: number;
  visitor_id: string;
}): Promise<void> {
  await sql()`
    insert into search_queries (query, results_count, visitor_id)
    values (${input.query}, ${input.results_count}, ${input.visitor_id})
  `;
}

export async function logPerfMetricToDb(input: {
  page_path: string;
  metric: string;
  value_ms: number;
  session_id: string | null;
  user_agent: string;
  metadata: unknown;
}): Promise<void> {
  await sql()`
    insert into perf_metrics (page_path, metric, value_ms, session_id, user_agent, metadata)
    values (${input.page_path}, ${input.metric}, ${input.value_ms}, ${input.session_id}, ${input.user_agent}, ${JSON.stringify(input.metadata)})
  `;
}

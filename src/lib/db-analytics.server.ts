import { sql } from "@/lib/neon.server";

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
}): Promise<void> {
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

export async function logPosterEventToDb(input: {
  poster_id: string | null;
  visitor_id: string;
  session_id: string;
  event_type: string;
  duration_seconds: number | null;
}): Promise<void> {
  await sql()`
    insert into analytics_poster_events (poster_id, visitor_id, session_id, event_type, duration_seconds)
    values (${input.poster_id}, ${input.visitor_id}, ${input.session_id}, ${input.event_type}, ${input.duration_seconds})
  `;
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

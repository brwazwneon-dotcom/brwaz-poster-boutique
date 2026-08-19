import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFooterMenu } from "@/lib/footer-menu";
import { BRANCH, SOCIAL } from "@/lib/site";
import { Instagram, Facebook, MessageCircle, MapPin } from "lucide-react";

const LOGO_PNG_FALLBACK = "/assets/brwazwneon-logo.png";
const LOGO_WEBP = "/assets/brwazwneon-logo.webp";

export function SiteFooter() {
  const { t } = useTranslation();
  const { links } = useFooterMenu();
  const shopLinks = links.filter((l) => l.enabled);
  const [logoSrc, setLogoSrc] = useState(LOGO_WEBP);
  const [logoHidden, setLogoHidden] = useState(false);

  const handleLogoError = () => {
    if (logoSrc !== LOGO_PNG_FALLBACK) {
      setLogoSrc(LOGO_PNG_FALLBACK);
      return;
    }
    setLogoHidden(true);
  };

  return (
    <footer className="mt-24 border-t border-border bg-background">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div>
          <Link to="/" aria-label="BRWAZWNEON home" className="inline-flex">
            {!logoHidden && (
              <img
                src={logoSrc}
                alt="BRWAZWNEON"
                width={180}
                height={72}
                className="h-auto w-[135px] object-contain sm:w-[170px]"
                loading="lazy"
                decoding="async"
                onError={handleLogoError}
              />
            )}
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t("footer.description")}</p>
          <p className="mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {BRANCH}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <a
              href={`https://wa.me/${SOCIAL.whatsappIntl}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href={SOCIAL.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href={SOCIAL.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border hover:bg-accent"
            >
              <Facebook className="h-4 w-4" />
            </a>
          </div>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            {t("footer.shop")}
          </h4>
          <ul className="space-y-2 text-sm">
            {shopLinks.map((l) => (
              <li key={l.id}>
                <a href={l.href} className="hover:underline">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            {t("footer.help")}
          </h4>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/offers" className="hover:underline">
                {t("nav.specialOffers")}
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:underline">
                {t("nav.cart")}
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            {t("footer.payment")}
          </h4>
          <p className="text-sm text-muted-foreground">{t("footer.paymentDescription")}</p>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {t("common.brand")}. {t("footer.allRightsReserved")}
      </div>
    </footer>
  );
}

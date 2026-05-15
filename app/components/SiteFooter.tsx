import Link from "next/link";
import { footerGroupsFor } from "@/lib/site-routes";
import { useLocale } from "@/lib/i18n/context";

export function SiteFooter() {
  const { locale, t } = useLocale();
  const footerGroups = footerGroupsFor(locale);
  const localePrefix = locale === "zh" ? "" : `/${locale}`;

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link className="site-footer-logo" href={localePrefix + "/"}>
            OpenAchieve
          </Link>
          <p>{t("footer.brand")}</p>
        </div>

        <div className="site-footer-map" aria-label="页脚站点地图">
          {footerGroups.map((group) => (
            <div className="site-footer-group" key={group.title}>
              <strong>{group.title}</strong>
              {group.links.map((link) => (
                <Link href={link.href} key={link.key}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .site-footer {
          width: min(1220px, calc(100% - 48px));
          margin: 44px auto 0;
          padding: 30px 0 40px;
          border-top: 1px solid #dfdacf;
          color: #5e5d59;
          font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans SC",
            "Microsoft YaHei", system-ui, sans-serif;
        }

        .site-footer-inner {
          display: grid;
          grid-template-columns: minmax(240px, 0.85fr) minmax(420px, 1.15fr);
          gap: 36px;
          align-items: start;
        }

        .site-footer-brand {
          display: grid;
          gap: 12px;
        }

        :global(.site-footer-logo) {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          color: #141413;
          font-family: "Iowan Old Style", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif;
          font-size: 25px;
          font-weight: 600;
          letter-spacing: 0.04em;
          line-height: 1;
          text-decoration: none;
          text-transform: uppercase;
        }

        :global(.site-footer-logo:visited) {
          color: #141413;
          text-decoration: none;
        }

        :global(.site-footer-logo:hover) {
          color: #c96442;
          text-decoration: none;
        }

        .site-footer-brand p {
          max-width: 360px;
          margin: 0;
          font-size: 14px;
          line-height: 1.7;
        }

        .site-footer-map {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 26px;
        }

        .site-footer-group {
          display: grid;
          gap: 10px;
          align-content: start;
        }

        .site-footer-group strong {
          color: #141413;
          font-size: 13px;
          text-transform: uppercase;
        }

        .site-footer-group :global(a) {
          color: #5e5d59;
          font-size: 14px;
          font-weight: 700;
          text-decoration: none;
        }

        .site-footer-group :global(a:hover) {
          color: #c96442;
          text-decoration: none;
        }

        @media (max-width: 760px) {
          .site-footer {
            width: min(100% - 28px, 1220px);
            margin-top: 32px;
          }

          .site-footer-inner,
          .site-footer-map {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </footer>
  );
}

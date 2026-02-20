import {
    PUBLIC_CONTACT_EMAIL,
    PUBLIC_SOCIAL_GITHUB_URL,
    PUBLIC_SOCIAL_TELEGRAM_URL,
    PUBLIC_SOCIAL_TIKTOK_URL,
} from '@/config/env';
import { GitHubIcon, TelegramIcon, TikTokIcon } from './SocialIcons';
import appLogo from "@/assets/logo.png";
import { I18nProvider, useI18n } from "@/features/i18n";

const appLogoSrc = typeof appLogo === "string" ? appLogo : appLogo.src;

function Logo() {
    const { t } = useI18n();

    return (
        <div className="flex items-center gap-3">
            <img
                src={appLogoSrc}
                alt={t("brand.logoAlt")}
                className="h-10 w-10 rounded-xl object-contain ring-1 ring-white/20"
            />
            <div className="flex flex-col leading-none">
                <span className="text-lg font-semibold tracking-tight text-white">Gebeya Pro</span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    {t("common.marketplace")}
                </span>
            </div>
        </div>
    );
}

function SocialLink({
    href,
    label,
    children,
}: {
    href: string;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <a
            href={href}
            aria-label={label}
            target="_blank"
            rel="noreferrer"
            // Glassmorphism style for dark theme
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-all hover:scale-105 hover:bg-white/20 hover:text-white"
        >
            {children}
        </a>
    );
}

export default function Footer() {
    return (
        <I18nProvider>
            <FooterContent />
        </I18nProvider>
    );
}

function FooterContent() {
    const { t } = useI18n();
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 bg-linear-to-br from-blue-900 via-indigo-900 to-slate-900 text-slate-300">
            <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
                <div className="grid gap-8 md:grid-cols-2 md:gap-12 lg:gap-20">
                    {/* Left Column: Brand & Info */}
                    <div className="flex flex-col justify-between space-y-6">
                        <div className="space-y-4">
                            <Logo />
                            <p className="max-w-md text-sm leading-relaxed text-slate-400">
                                {t("footer.about")}
                            </p>
                            <p className="max-w-md text-sm leading-relaxed text-slate-400">
                                {t("footer.about2")}
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                                    {t("common.contact")}
                                </p>
                                <a
                                    href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
                                    className="text-sm font-medium text-white hover:text-blue-300 hover:underline"
                                >
                                    {PUBLIC_CONTACT_EMAIL}
                                </a>
                            </div>

                            <div className="flex items-center gap-2">
                                <SocialLink href={PUBLIC_SOCIAL_TELEGRAM_URL} label="Telegram">
                                    <TelegramIcon className="h-4 w-4" />
                                </SocialLink>
                                <SocialLink href={PUBLIC_SOCIAL_GITHUB_URL} label="GitHub">
                                    <GitHubIcon className="h-4 w-4" />
                                </SocialLink>
                                <SocialLink href={PUBLIC_SOCIAL_TIKTOK_URL} label="TikTok">
                                    <TikTokIcon className="h-4 w-4" />
                                </SocialLink>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Merchant CTA */}
                    <div className="h-fit self-start rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-white">{t("footer.postAdTitle")}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">
                            {t("footer.postAdDescription")}
                        </p>
                        <a
                            href="/?openPostAd=1"
                            className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                        >
                            {t("common.postAd")}
                        </a>
                    </div>
                </div>

                {/* Footer Bottom */}
                <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
                    <p>{t("footer.copyright", { year })}</p>
                    <span>
                        <span className="">{t("footer.developedBy")}</span>{' '}
                        <a
                            href="https://github.com/hmyunis"
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-slate-400 transition-colors hover:text-white"
                        >
                            <span className="underline underline-offset-4 hover:text-white transition-colors">
                                @hmyunis
                            </span>
                        </a>
                    </span>
                </div>
            </div>
        </footer>
    );
}

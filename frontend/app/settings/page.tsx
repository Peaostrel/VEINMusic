/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 */
"use client";
import { Suspense, useState } from "react";
import {
  Bell,
  Blocks,
  Download,
  Eye,
  FlaskConical,
  LayoutDashboard,
  Link2,
  Music2,
  Palette,
  Radio,
  Search,
  Shield,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { API_URL } from "@/app/lib/api";
import StatusText from "@/components/StatusText";
import { Loading, PageHeader, btn } from "@/components/ui";
import GeneralTab from "./tabs/GeneralTab";
import ShowcaseTab from "./tabs/ShowcaseTab";
import ThemeTab from "./tabs/ThemeTab";
import PrivacyTab from "./tabs/PrivacyTab";
import IntegrationsTab from "./tabs/IntegrationsTab";
import SecurityTab from "./tabs/SecurityTab";
import ExportTab from "./tabs/ExportTab";
import ListeningTab from "./tabs/ListeningTab";
import NotificationsTab from "./tabs/NotificationsTab";
import ProfileLayoutTab from "./tabs/ProfileLayoutTab";
import FeedTab from "./tabs/FeedTab";
import WrappedSettingsTab from "./tabs/WrappedSettingsTab";
import ExperimentsTab from "./tabs/ExperimentsTab";
import CropModal from "./components/CropModal";
import ConfirmShowcaseModal from "./components/ConfirmShowcaseModal";
import {
  SETTINGS_TABS,
  useSettingsPage,
  type SettingsTab,
} from "./useSettingsPage";

const TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  general: UserRound,
  showcase: Sparkles,
  theme: Palette,
  "profile-layout": LayoutDashboard,
  listening: Music2,
  feed: Radio,
  notifications: Bell,
  privacy: Eye,
  wrapped: Blocks,
  security: Shield,
  integrations: Link2,
  export: Download,
  experiments: FlaskConical,
};

function SettingsContent() {
  const s = useSettingsPage();
  const { data, updateData, activeTab, status } = s;
  const [settingsSearch, setSettingsSearch] = useState("");

  if (s.loading) return <Loading label="Загружаем настройки…" />;

  let content: React.ReactNode;
  if (activeTab === "security") content = <SecurityTab />;
  else if (activeTab === "export")
    content = <ExportTab initialStatus={status} />;
  else
    content = (
      <form onSubmit={s.handleSubmit}>
        {activeTab === "general" && (
          <GeneralTab
            data={data}
            updateData={updateData}
            countries={s.countries}
            cities={s.cities}
            isCityInputFocused={s.isCityInputFocused}
            setIsCityInputFocused={s.setIsCityInputFocused}
            onSelectFile={s.onSelectFile}
            username={s.userProfile?.username || ""}
            socialLinks={s.socialLinks}
            addSocialLink={s.addSocialLink}
            updateSocialLink={s.updateSocialLink}
            removeSocialLink={s.removeSocialLink}
          />
        )}
        {activeTab === "showcase" && (
          <ShowcaseTab data={data} updateData={updateData} />
        )}
        {activeTab === "theme" && (
          <ThemeTab
            data={data}
            updateData={updateData}
            updatePreference={s.updatePreference}
            level={s.level}
          />
        )}
        {activeTab === "profile-layout" && (
          <ProfileLayoutTab data={data} updatePreference={s.updatePreference} />
        )}
        {activeTab === "listening" && (
          <ListeningTab data={data} updatePreference={s.updatePreference} />
        )}
        {activeTab === "feed" && (
          <FeedTab data={data} updatePreference={s.updatePreference} />
        )}
        {activeTab === "notifications" && (
          <NotificationsTab data={data} updatePreference={s.updatePreference} />
        )}
        {activeTab === "privacy" && (
          <PrivacyTab
            data={data}
            updateData={updateData}
            updatePreference={s.updatePreference}
          />
        )}
        {activeTab === "wrapped" && (
          <WrappedSettingsTab
            data={data}
            updatePreference={s.updatePreference}
          />
        )}
        {activeTab === "integrations" && (
          <IntegrationsTab
            data={data}
            updateData={updateData}
            updatePreference={s.updatePreference}
            userProfile={s.userProfile}
            handleDisconnect={s.handleDisconnect}
            saveYandexToken={s.saveYandexToken}
            startLastfmImport={s.startLastfmImport}
            importRefresh={s.importRefresh}
            generatedApiKey={s.generatedApiKey}
            handleGenerateApiKey={s.handleGenerateApiKey}
            handleCopyKey={s.handleCopyKey}
            copied={s.copied}
            API_URL={API_URL}
          />
        )}
        {activeTab === "experiments" && (
          <ExperimentsTab data={data} updatePreference={s.updatePreference} />
        )}

        <div className="sticky bottom-[var(--tabbar-offset)] z-10 -mx-1 mt-8 flex items-center justify-between gap-4 border-t border-line-soft bg-bg/95 px-1 py-4">
          <StatusText
            text={status || (s.isDirty ? "Есть несохранённые изменения" : "")}
          />
          <button
            type="button"
            onClick={s.resetPreferences}
            className={`${btn.ghost} ${btn.sm} ml-auto`}
          >
            По умолчанию
          </button>
          <button
            type="submit"
            disabled={!s.isDirty}
            className={`${btn.primary} ${btn.md}`}
          >
            Сохранить всё
          </button>
        </div>
      </form>
    );

  return (
    <>
      {s.cropImageSrc && (
        <CropModal
          image={s.cropImageSrc}
          crop={s.crop}
          zoom={s.zoom}
          aspect={s.cropFieldTarget === "coverUrl" ? 3 : 1}
          onCropChange={s.setCrop}
          onZoomChange={s.setZoom}
          onCropComplete={s.setCroppedAreaPixels}
          onCancel={() => s.setCropImageSrc(null)}
          onSave={s.handleCropSave}
        />
      )}
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <PageHeader title="Настройки" />
        <div className="flex flex-col gap-8 md:flex-row md:gap-10">
          <div className="shrink-0 md:sticky md:top-6 md:w-[230px] md:self-start">
            <label className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-fg-3 focus-within:border-fg-3">
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <input
                type="search"
                value={settingsSearch}
                onChange={(event) => setSettingsSearch(event.target.value)}
                placeholder="Найти раздел"
                aria-label="Поиск по настройкам"
                className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-3"
              />
            </label>
            <nav
              aria-label="Разделы настроек"
              className="hide-scrollbar flex gap-1 overflow-x-auto md:max-h-[calc(100vh-8rem)] md:flex-col md:gap-0.5 md:overflow-y-auto"
            >
              {SETTINGS_TABS.filter((tab) =>
                tab.label.toLowerCase().includes(settingsSearch.toLowerCase()),
              ).map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => s.setActiveTab(tab.id)}
                    aria-current={activeTab === tab.id ? "page" : undefined}
                    className={`flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors ${
                      activeTab === tab.id
                        ? "bg-surface-2 font-medium text-fg"
                        : "text-fg-2 hover:text-fg"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <section
            aria-label="Настройки"
            className="min-w-0 max-w-[760px] flex-1"
          >
            {content}
          </section>
        </div>
      </div>

      {s.showConfirmModal && (
        <ConfirmShowcaseModal
          onCancel={() => s.setShowConfirmModal(false)}
          onConfirm={s.executeSave}
        />
      )}
    </>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<Loading label="Загружаем настройки…" />}>
      <SettingsContent />
    </Suspense>
  );
}

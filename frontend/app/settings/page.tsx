/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 */
"use client";
import { Suspense } from "react";
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
import CropModal from "./components/CropModal";
import ConfirmShowcaseModal from "./components/ConfirmShowcaseModal";
import { SETTINGS_TABS, useSettingsPage } from "./useSettingsPage";

function SettingsContent() {
  const s = useSettingsPage();
  const { data, updateData, activeTab, status } = s;

  if (s.loading) return <Loading label="Загружаем настройки…" />;

  let content: React.ReactNode;
  if (activeTab === "security") content = <SecurityTab />;
  else if (activeTab === "export")
    content = <ExportTab initialStatus={status} />;
  else if (activeTab === "integrations")
    content = (
      <IntegrationsTab
        data={data}
        updateData={updateData}
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
    );
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
          <ThemeTab data={data} updateData={updateData} level={s.level} />
        )}
        {activeTab === "privacy" && (
          <PrivacyTab data={data} updateData={updateData} />
        )}

        <div className="sticky bottom-[var(--tabbar-offset)] z-10 -mx-1 mt-8 flex items-center justify-between gap-4 border-t border-line-soft bg-bg/95 px-1 py-4">
          <StatusText text={status} />
          <button type="submit" className={`${btn.primary} ${btn.md} ml-auto`}>
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
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          <nav
            aria-label="Разделы настроек"
            className="hide-scrollbar flex shrink-0 gap-1 overflow-x-auto md:w-[210px] md:flex-col md:gap-0.5"
          >
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => s.setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`h-9 shrink-0 rounded-lg px-3 text-left text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-surface-2 font-medium text-fg"
                    : "text-fg-2 hover:text-fg"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <section
            aria-label="Настройки"
            className="min-w-0 max-w-[760px] flex-1"
          >
            {activeTab === "integrations" && (
              <StatusText text={status} className="mb-4" />
            )}
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

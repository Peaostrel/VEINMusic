/**
 * Settings Page
 * -------------
 * Страница настроек профиля и интеграций.
 */
"use client";
import { Suspense } from "react";
import { API_URL } from "@/app/lib/api";
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
  const { data, updateData, activeTab, status, isSaveDisabled } = s;

  if (s.loading)
    return (
      <output className="min-h-screen text-[var(--accent-text)] flex flex-col items-center justify-center gap-4 font-bold text-xl animate-pulse">
        <div
          aria-hidden="true"
          className="animate-spin border-4 border-[var(--accent-text)] border-t-transparent rounded-full w-12 h-12"
        ></div>
        Загрузка настроек...
      </output>
    );

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

        <div className="p-6 bg-black/20 flex justify-between items-center border-t border-white/5">
          <output className="text-[var(--accent-text)] font-bold">
            {status}
          </output>
          <button
            type="submit"
            disabled={isSaveDisabled}
            className={`font-black px-8 py-3 rounded-lg transition-all ${
              isSaveDisabled
                ? "bg-white/10 text-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-[var(--accent)] to-[var(--accent-hover)] text-[var(--text-on-accent)] hover:scale-105"
            }`}
          >
            {isSaveDisabled ? "Заблокировано" : "Сохранить всё"}
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
      <div className="min-h-screen text-white p-4 md:p-8 max-w-6xl mx-auto flex flex-col md:flex-row gap-8 pt-24">
        <nav
          aria-label="Разделы настроек"
          className="w-full md:w-64 shrink-0 flex flex-col gap-2"
        >
          <a
            href="/feed"
            className="text-sm font-bold text-gray-400 hover:text-white mb-4 block px-4"
          >
            ← Глобальная лента
          </a>
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => s.setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={`text-left px-4 py-3 rounded-lg font-bold transition-all ${activeTab === tab.id ? "bg-[var(--accent)] text-[var(--text-on-accent)]" : "text-gray-400 hover:bg-[#1e1e1e]"}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section
          aria-label="Настройки"
          className="flex-grow bg-[#1e1e1e]/60 backdrop-blur-md rounded-xl border border-white/5 shadow-lg relative overflow-hidden mb-20"
        >
          {content}
        </section>
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
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-white">
          Загрузка...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}

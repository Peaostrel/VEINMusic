"use client";

import dynamic from "next/dynamic";
import type { Area, CropperProps, Point } from "react-easy-crop";
import Dialog from "@/components/Dialog";

// The class declares the rest of CropperProps as defaultProps, which
// dynamic() does not carry over, so only the props we pass are required.
type UsedCropperProps = Pick<
  CropperProps,
  | "image"
  | "crop"
  | "zoom"
  | "aspect"
  | "onCropChange"
  | "onZoomChange"
  | "onCropComplete"
>;

const Cropper = dynamic<UsedCropperProps>(
  () =>
    import("react-easy-crop").then(
      (m) => m.default as unknown as React.ComponentType<UsedCropperProps>,
    ),
  { ssr: false },
);

export default function CropModal({
  image,
  crop,
  zoom,
  aspect,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onCancel,
  onSave,
}: Readonly<{
  image: string;
  crop: Point;
  zoom: number;
  aspect: number;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (areaPixels: Area) => void;
  onCancel: () => void;
  onSave: () => void;
}>) {
  return (
    <Dialog label="Обрезка изображения" onClose={onCancel}>
      <div className="relative w-full max-w-4xl h-[50vh] md:h-[70vh] bg-surface rounded-xl overflow-hidden border border-line">
        <Cropper
          image={image}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={(_, areaPixels) => onCropComplete(areaPixels)}
        />
      </div>
      <div className="flex gap-4 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-lg font-medium text-fg bg-line hover:bg-line transition-all border border-line"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-8 py-3 rounded-lg font-medium text-fg bg-accent hover:bg-[var(--accent-hover)] transition-all"
        >
          Сохранить
        </button>
      </div>
    </Dialog>
  );
}

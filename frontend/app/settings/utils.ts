import type { Area } from "react-easy-crop";
import { msg } from "@/app/lib/i18n/core";

export const createImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () =>
      reject(new Error("Image load error")),
    );
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

/** The crop, scaled down to fit `maxSide` (the server fits it again): a
 * phone photo is not sent at full resolution. */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  maxSide = Infinity,
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const scale = Math.min(
    1,
    maxSide / Math.max(pixelCrop.width, pixelCrop.height),
  );
  canvas.width = Math.round(pixelCrop.width * scale);
  canvas.height = Math.round(pixelCrop.height * scale);
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas is empty"));
          return;
        }
        resolve(new File([blob], "cropped.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.95,
    );
  });
}

export const fixImageUrl = (url: string): string => {
  if (!url) return url;
  const match = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  return match ? `https://drive.google.com/uc?export=view&id=${match[1]}` : url;
};

export const THEMES = [
  { id: "classic", name: msg("Турист (Классика)"), req: 1, color: "#e3a93b" },
  { id: "green", name: msg("Меломан"), req: 5, color: "#5fb58e" },
  { id: "orange", name: msg("Аудиофил"), req: 15, color: "#e07a45" },
  { id: "purple", name: msg("Маньяк"), req: 30, color: "#9d86e6" },
  { id: "red", name: msg("Легенда"), req: 50, color: "#e06c6c" },
  { id: "cyan", name: msg("Божество"), req: 100, color: "#56b6c2" },
  { id: "rainbow", name: msg("RGB Эстетика"), req: 150, isRainbow: true },
  {
    id: "custom",
    name: msg("Создатель (Свой цвет)"),
    req: 200,
    isCustom: true,
  },
];

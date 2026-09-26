import type { Area } from "react-easy-crop";

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

export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height,
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
  { id: "classic", name: "Турист (Классика)", req: 1, color: "#e3a93b" },
  { id: "green", name: "Меломан", req: 5, color: "#5fb58e" },
  { id: "orange", name: "Аудиофил", req: 15, color: "#e07a45" },
  { id: "purple", name: "Маньяк", req: 30, color: "#9d86e6" },
  { id: "red", name: "Легенда", req: 50, color: "#e06c6c" },
  { id: "cyan", name: "Божество", req: 100, color: "#56b6c2" },
  { id: "rainbow", name: "RGB Эстетика", req: 150, isRainbow: true },
  { id: "custom", name: "Создатель (Свой цвет)", req: 200, isCustom: true },
];

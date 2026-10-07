import { ImageResponse } from "next/og";

export function generateImageMetadata() {
  return [
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const px = Number(await id) || 192;
  return new ImageResponse(<AppGlyph px={px} />, { width: px, height: px });
}

export function AppGlyph({ px }: { px: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#111113",
      }}
    >
      <div
        style={{
          width: px * 0.62,
          height: px * 0.62,
          borderRadius: px * 0.14,
          background: "#3b82f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: px * 0.36,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        D
      </div>
    </div>
  );
}

import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const BG = "#0a0a0c";
const ACCENT = "#e0a63e";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          borderRadius: 7,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            color: ACCENT,
            lineHeight: 1,
          }}
        >
          M
        </div>
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: ACCENT,
          }}
        />
      </div>
    ),
    { ...size },
  );
}

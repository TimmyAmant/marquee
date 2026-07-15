import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BG = "#0a0a0c";
const ACCENT = "#e0a63e";

export default function AppleIcon() {
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
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 124,
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
            top: 34,
            right: 34,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: ACCENT,
          }}
        />
      </div>
    ),
    { ...size },
  );
}

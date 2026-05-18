/**
 * MediaPreview — Reusable media thumbnail + lightbox component.
 * Shows a clickable thumbnail that opens a full-screen lightbox with video playback or image zoom.
 */
import { useState, useEffect, useCallback, memo } from "react";
import { X, Play, ExternalLink, Image as ImageIcon } from "lucide-react";

/** Detect if a URL points to a video */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m3u8)/i.test(url) || url.includes("/v/t2/");
}

/* ── Lightbox overlay ───────────────────────────────── */

interface LightboxProps {
  src: string;
  isVideo: boolean;
  onClose: () => void;
  externalUrl?: string;
}

export function MediaLightbox({ src, isVideo, onClose, externalUrl }: LightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-900 z-10 transition-colors"
      >
        <X size={24} />
      </button>
      {externalUrl && (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 left-4 p-2 text-gray-500 hover:text-gray-900 z-10 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={18} />
        </a>
      )}
      <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh]">
        {isVideo ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85vh] rounded-lg"
          />
        ) : (
          <img
            src={src}
            alt=""
            className="max-w-full max-h-[85vh] rounded-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}

/* ── Thumbnail with click-to-open ───────────────────── */

interface MediaPreviewProps {
  /** URL to the media (image or video) */
  src: string | null | undefined;
  /** Optional poster/thumbnail URL for videos */
  poster?: string | null;
  /** Optional external link (e.g. original post URL) */
  externalUrl?: string;
  /** CSS class for the thumbnail container */
  className?: string;
  /** Inline styles for the container */
  style?: React.CSSProperties;
  /** Aspect ratio class, e.g. "aspect-square", "aspect-video", "aspect-[9/16]" */
  aspect?: string;
  /** Show a play icon overlay for videos (default: true) */
  showPlayIcon?: boolean;
  /** Alt text */
  alt?: string;
  /** Optional badge overlay (top-left) */
  badge?: React.ReactNode;
}

export const MediaPreview = memo(function MediaPreview({
  src,
  poster,
  externalUrl,
  className = "",
  style,
  aspect = "aspect-square",
  showPlayIcon = true,
  alt = "",
  badge,
}: MediaPreviewProps) {
  const [open, setOpen] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const isVideo = isVideoUrl(src);
  const thumbnailUrl = poster || src;

  const handleOpen = useCallback(() => {
    if (src) setOpen(true);
  }, [src]);

  if (!src) {
    return (
      <div
        className={`relative overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center ${aspect} ${className}`}
        style={style}
      >
        <ImageIcon className="w-6 h-6 text-gray-900/10" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-lg cursor-pointer group ${aspect} ${className}`}
        style={{ background: "rgba(0,0,0,0.03)", ...style }}
        onClick={handleOpen}
      >
        {/* Thumbnail image */}
        {imgLoading && !imgError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-gray-200 border-t-white/40 rounded-full animate-spin" />
          </div>
        )}
        {!imgError ? (
          // No poster + source is a video → render the video itself with
          // preload=metadata so the browser shows the first frame as a
          // thumbnail. Without this, an <img src=video.mp4> just shows blank.
          isVideo && !poster ? (
            <video
              src={src || ""}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onLoadedMetadata={() => setImgLoading(false)}
              onError={() => {
                setImgLoading(false);
                setImgError(true);
              }}
            />
          ) : (
            <img
              src={thumbnailUrl || ""}
              alt={alt}
              loading="lazy"
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onLoad={() => setImgLoading(false)}
              onError={() => {
                setImgLoading(false);
                setImgError(true);
              }}
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
            <ImageIcon className="w-6 h-6 text-gray-900/10" />
          </div>
        )}

        {/* Play icon for videos */}
        {isVideo && showPlayIcon && !imgError && (
          <div className="absolute inset-0 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
            <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-4 h-4 text-gray-900 fill-white ml-0.5" />
            </div>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/20 transition-colors" />

        {/* Optional badge */}
        {badge && (
          <div className="absolute top-1 left-1 z-10">{badge}</div>
        )}
      </div>

      {/* Lightbox */}
      {open && (
        <MediaLightbox
          src={src}
          isVideo={isVideo}
          onClose={() => setOpen(false)}
          externalUrl={externalUrl}
        />
      )}
    </>
  );
});

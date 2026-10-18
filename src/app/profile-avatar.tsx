"use client";
import { useEffect, useState, useRef } from "react";
import { Camera } from "lucide-react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
export default function ProfileAvatar({
  id,
  name,
  small = false,
}: {
  id?: string;
  name: string;
  small?: boolean;
}) {
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) {
        setFailed(false);
        setVersion((v) => v + 1);
      }
    };
    window.addEventListener("avatar-changed", changed);
    return () => window.removeEventListener("avatar-changed", changed);
  }, [id]);
  useEffect(() => {
    setFailed(false);
  }, [id]);
  return (
    <span className={`avatar ${small ? "small" : ""}`}>
      {id && !failed ? (
        <img
          key={`${id}-${version}`}
          src={`/api/avatar/${id}?v=${version}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        name.slice(0, 1)
      )}
    </span>
  );
}
export function AvatarEditor({
  id,
  name,
  csrf,
}: {
  id: string;
  name: string;
  csrf: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [selection, setSelection] = useState<{
    file: File;
    url: string;
  } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  useEffect(() => {
    return () => {
      if (selection) URL.revokeObjectURL(selection.url);
    };
  }, [selection]);
  async function choose(file: File) {
    setMessage("");
    if (file.size > 8 * 1024 * 1024) {
      setMessage("8MB以下の画像を選んでください。");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 20_000_000)
        throw new Error();
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setArea(null);
      setSelection({ file, url });
    } catch {
      URL.revokeObjectURL(url);
      setMessage(
        "画像を読み込めませんでした。20メガピクセル以下のJPEG・PNGなどを選んでください。",
      );
    }
  }
  async function save(file: File | null, chosenArea?: Area) {
    setBusy(true);
    setMessage("");
    try {
      let encoded: string | null = null;
      if (file) {
        if (file.size > 8 * 1024 * 1024)
          throw new Error("8MB以下の画像を選んでください。");
        const url = URL.createObjectURL(file);
        try {
          const image = new window.Image();
          image.src = url;
          try {
            await image.decode();
          } catch {
            throw new Error(
              "この画像を読み込めません。JPEG・PNGなどに変換して選び直してください。",
            );
          }
          if (image.naturalWidth * image.naturalHeight > 20_000_000)
            throw new Error(
              "画像が大きすぎます。小さくして選び直してください。",
            );
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 192;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("画像を変換できませんでした。");
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 192, 192);
          ctx.drawImage(
            image,
            chosenArea?.x ?? (image.naturalWidth - side) / 2,
            chosenArea?.y ?? (image.naturalHeight - side) / 2,
            chosenArea?.width ?? side,
            chosenArea?.height ?? side,
            0,
            0,
            192,
            192,
          );
          encoded = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
          if (encoded.length > 65536)
            throw new Error("画像を小さくして選び直してください。");
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const response = await fetch(`/api/avatar/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ image: encoded }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.dispatchEvent(new CustomEvent("avatar-changed", { detail: id }));
      setSelection(null);
      setMessage(
        file ? "アイコンを変更しました。" : "名前の頭文字に戻しました。",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "変更できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="avatar-editor">
      <button
        type="button"
        className="avatar-edit-button"
        aria-label="プロフィールのアイコンを変更"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <ProfileAvatar id={id} name={name} />
        <span className="avatar-camera">
          <Camera size={14} aria-hidden="true" />
        </span>
      </button>
      <div>
        <p className="avatar-edit-label">アイコンを押して変更</p>
        <input
          ref={fileInput}
          hidden
          aria-label="プロフィール画像を選択"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void choose(file);
            event.target.value = "";
          }}
        />
        <p className="form-note">
          位置と拡大率を調整して丸く切り取れます。8MBまで。ログイン済みのユーザーに公開されます。
        </p>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => void save(null)}
        >
          頭文字に戻す
        </button>
        <p role="status" className="form-note">
          {busy ? "保存中…" : message}
        </p>
      </div>
      {selection && (
        <section className="avatar-crop-panel" aria-label="アイコンの切り取り">
          <h3>画像を切り取る</h3>
          <p className="form-note">画像を動かして位置を調整してください。</p>
          <div className="avatar-crop-stage">
            <Cropper
              image={selection.url}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              disableAutomaticStylesInjection
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, pixels) => setArea(pixels)}
            />
          </div>
          <label>
            拡大率
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={busy}
              onChange={(e) => {
                setArea(null);
                setZoom(Number(e.target.value));
              }}
            />
          </label>
          <div className="avatar-crop-actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setSelection(null)}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !area}
              onClick={() => {
                if (area) void save(selection.file, area);
              }}
            >
              {busy ? "保存中…" : "この範囲で保存"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

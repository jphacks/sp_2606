"use client";
import { prefectures, type ProfileAttributes } from "@/lib/profile-attributes";
export default function ProfileAttributesEditor({
  initial,
}: {
  initial?: ProfileAttributes | null;
}) {
  return (
    <fieldset className="profile-attributes-editor">
      <legend>属性</legend>
      <p className="form-note">
        文系・理系は必須、その他は任意です。入力した内容はログイン済み全員に公開されます。個人を特定する情報の入力は慎重に行ってください。
      </p>
      <label>
        文系・理系（必須）
        <select
          name="background"
          defaultValue={initial?.background || ""}
          required
        >
          <option value="" disabled>
            選択してください
          </option>
          <option value="humanities">文系</option>
          <option value="science">理系</option>
        </select>
      </label>
      <label>
        所属大学（任意）
        <input
          name="university"
          defaultValue={initial?.university || ""}
          maxLength={100}
        />
      </label>
      <label>
        学部（任意）
        <input
          name="faculty"
          defaultValue={initial?.faculty || ""}
          maxLength={100}
        />
      </label>
      <label>
        会社で行っている業務（任意）
        <textarea
          name="work"
          defaultValue={initial?.work || ""}
          maxLength={300}
          rows={2}
        />
      </label>
      <label>
        居住地・都道府県（任意）
        <select name="prefecture" defaultValue={initial?.prefecture || ""}>
          <option value="">設定しない</option>
          {prefectures.map((p) => (
            <option value={p} key={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

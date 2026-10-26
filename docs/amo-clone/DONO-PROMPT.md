# Dono — Gemini (rasm) uchun promptlar

Maqsad: CRM'ning AI-agenti «Dono» uchun premium, milliy (o'zbek) personaj. Natijani shu papkaga qo'ying: `frontend/public/dono/` (nomlar pastda).

## 1) ASOSIY PROMPT (avatar, 1:1, 2048×2048) → `dono-avatar.png`

```
Premium 3D-stylized character portrait of "Dono", a wise, warm Uzbek sales mentor — the AI assistant of a modern CRM. Gender-neutral, ageless, around 40, dignified and kind. Pixar-meets-luxury-brand quality, soft cinematic studio lighting, subtle rim light, shallow depth of field, ultra-detailed, polished, 8k render.

Face: gentle half-smile, calm intelligent almond eyes with a spark of humor, neat short beard-stubble OR clean-shaven (pick the most elegant), warm olive-tan skin, relaxed confident look straight at the camera.

Clothing and national identity (very important, authentic details):
- A traditional Uzbek DO'PPI (chustiy style): black four-sided skullcap, taller at the top, with a crisp white hem and fine white-and-gold embroidered "bodom" (paisley/almond) motifs plus a small four-petal flower at the center.
- A "chopon"-style collar in luxurious silk ADRAS/ATLAS (ikat) with vivid turquoise, ruby red, saffron yellow and white flame-like patterns.
- A thin gold brooch or small gold detail at the collar.

Background: deep Samarkand turquoise gradient (Registan dome color) with a very subtle, blurred geometric "girih/islimi" Uzbek ornament pattern and soft golden bokeh. Chest-up framing, centered, head fully inside a circular safe area (leave margin around the head so it survives a circular crop).

Mood: trustworthy, wise, premium, friendly. No text, no logo, no watermark, no extra hands, no distortion, symmetrical natural anatomy.
```

## 2) To'liq bo'yli (ish stoli / kartochka uchun, 3:4) → `dono-full.png`

```
Same character "Dono" (use the exact same face, do'ppi and adras collar as the portrait), full-body, standing in a relaxed welcoming pose, one hand gently open in an inviting "marhamat" gesture, the other holding a slim glowing tablet that shows an abstract sales pipeline graph in turquoise and gold. Wearing an elegant modern-traditional outfit: silk adras chopon in turquoise/ruby/saffron over a clean white shirt, dark trousers, polished shoes, a gold-embroidered belt "belbog'". Soft studio lighting, clean solid deep-turquoise background with faint Uzbek ornament, premium 3D render, no text.
```

## 3) Ifodalar to'plami (6 ta, 1:1) → `dono-happy.png`, `dono-thinking.png`, `dono-celebrate.png`, `dono-sleepy.png`, `dono-warning.png`, `dono-wave.png`

```
Use the exact same character "Dono" (same face, do'ppi, adras collar, same lighting and turquoise background). Generate ONE image per expression, chest-up, centered:
1. happy — warm bright smile, eyes crinkled
2. thinking — hand on chin, eyes looking up, slight smile
3. celebrate — both hands raised, joyful "Barakalla!" look, tiny golden confetti
4. sleepy — eyes gently closed, a small "z", peaceful (used when the AI key is not configured)
5. warning — one eyebrow raised, finger raised kindly, caring not angry
6. wave — friendly greeting wave with one hand, welcoming smile
Keep the style identical across all images. No text, no watermark.
```

## 4) Kichik belgi (favicon / FAB, 1:1, oddiy) → `dono-icon.png`

```
Simplified flat vector-style emblem of the same Dono character: only the head with the do'ppi (black cap, white hem, gold-white bodom embroidery) and smiling eyes, on a round deep-turquoise badge with a thin gold ring. Bold simple shapes that stay readable at 32×32 pixels, no gradients noise, no text.
```

## Maslahatlar
- Avval 1-promptni bajaring; yoqqan natijani yuklab, qolgan promptlarda "shu rasmdagi personajning o'zi" deb **o'sha rasmni ilova qiling** (yuz bir xil bo'lishi uchun).
- Bosh tomon atrofida bo'sh joy qoldirish muhim: CRM'da avatar **dumaloq** kesiladi.
- Tayyor fayllarni menga bering (yoki `frontend/public/dono/` ga qo'ying) — men ularni avatar, ish stoli qutisi, FAB, «AI-агенты» kartochkasi va holatlar (uxlayapti/ishlayapti/tabrik) bo'yicha joylab beraman; hozirgi SVG zaxira bo'lib qoladi.

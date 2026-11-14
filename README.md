# VisionMate AI — Android MVP

Voice-first accessibility companion for blind and low-vision users.

## What is included

- Expo / React Native Android app with large accessible controls.
- Multilingual speech recognition (device/provider support varies by language and handset).
- Spoken AI responses using Android text-to-speech.
- Camera capture and AI image description through a secure backend.
- Location permission and hand-off to Google Maps walking directions.
- Emergency contacts saved locally on the device.
- A Node.js API server that keeps the AI API key off the phone.
- Clear safety messaging: this MVP is not a certified mobility aid or obstacle detector.

This is a runnable MVP foundation, **not a production-certified assistive navigation system**. Validate with blind and low-vision users and mobility specialists before real-world deployment.

## Requirements

- Node.js 20+
- Android phone or Android emulator
- Expo Go for basic development, or an EAS development build for native speech-recognition plugin support
- An AI API key for live chat and image description

## 1. Start the API server

```bash
cd server
cp .env.example .env
# Add your API key and a strong API_SECRET to .env
npm install
npm run dev
```

The server listens on `http://localhost:8787`.

For a physical Android phone, `localhost` means the phone itself. Set `EXPO_PUBLIC_API_BASE_URL` in `mobile/.env` to your computer's LAN IP, for example `http://192.168.1.20:8787`. Both devices must be on the same network. Use HTTPS for any deployed server.

## 2. Start the Android app

```bash
cd mobile
cp .env.example .env
# Set EXPO_PUBLIC_API_BASE_URL to your server URL
npm install
npx expo start
```

Scan the QR code using Expo Go where supported. For the native speech-recognition module, create a development build:

```bash
npx expo prebuild
npx expo run:android
```

## 3. Configure the AI provider

The server uses the OpenAI Responses API. Set:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (choose a vision-capable model available to your account)
- `API_SECRET` (a long random value)
- `PORT` (optional; defaults to 8787)

Never put `OPENAI_API_KEY` in the mobile app or commit `.env` files.

The app sends `x-app-secret` to the server. This is a starter access gate, not a substitute for production user authentication, rate limiting, abuse prevention, and secret rotation.

## Supported capabilities and limitations

- Languages: the interface includes major Indian languages. Speech recognition and TTS availability depend on the Android device, installed speech services, network, and selected language pack. The app reports recognition errors instead of pretending every language is available.
- Navigation: location is handed off to Google Maps walking directions. The app does not provide its own certified turn-by-turn navigation engine.
- Object understanding: image descriptions are AI-generated and can be wrong. Confirm critical details with a trusted person.
- Emergency: this starter stores contacts and can open the dialer. It does not silently call or send location.
- Offline: Android's installed TTS may work offline for downloaded voices; AI and image analysis require connectivity.

## Before production

1. Replace the shared starter secret with real authentication (Supabase Auth or equivalent) and per-user authorization.
2. Add encrypted server-side persistence only with clear consent.
3. Add proper consent, privacy policy, retention and deletion controls.
4. Add rate limits, monitoring, logging redaction and abuse protection.
5. Conduct accessibility audits with TalkBack and real users.
6. Evaluate speech quality for every target Indian language and dialect.
7. Do not advertise obstacle detection or road-crossing safety without validated hardware/software and field testing.
8. Add a vetted navigation provider and accessibility routing where available.
9. Add human-partner calling only with explicit consent and reliable call-provider integration.

# Find the Imposter

<p align="center"><img width="1325" height="945" alt="image" src="https://github.com/user-attachments/assets/ce0065ce-34b7-4187-9e48-e87de9287e71" /></p>
<p align="center"><img width="1321" height="944" alt="Screenshot 2026-04-05 161528" src="https://github.com/user-attachments/assets/a34af196-9cfe-48bc-947b-9ef0076c95aa" /></p>
<p align="center"><img width="1323" height="944" alt="Screenshot 2026-04-05 161556" src="https://github.com/user-attachments/assets/225657f1-818c-4012-a632-4bb68c0079a2" /></p>

Real-time multiplayer social deduction game built with Next.js App Router and Firebase Realtime Database.

## Features

- Google authentication
- Profile setup (country + avatar)
- Internet room system with 6-character room codes
- Realtime lobby sync and host controls
- Gemini-powered word pair generation (with fallback list)
- Turn-based clue loop with 20-second timer and auto "Didn't answer"
- Voting phase and result reveal
- Global leaderboard backed by Firebase

## Tech Stack

- Next.js
- Firebase Authentication
- Firebase Realtime Database
- Google Gen AI SDK (@google/genai)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and set credentials:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_DATABASE_URL`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `GEMINI_API_KEY` (optional but recommended)

4. Enable Firebase services in your project:

- Authentication -> Google provider
- Realtime Database -> create database in production mode or test mode

5. Start development server:

```bash
npm run dev
```

## Internet Multiplayer Requirement

To let users connect over the internet, use a hosted Firebase project (not local-only emulator settings) and deploy the app to a public URL (for example Vercel). Players can then join each other by room code from different networks.

## Suggested Realtime Database Rules (Starter)

You should tighten these for production. This starter keeps user and room writes scoped to authenticated users.

```json
{
	"rules": {
		"users": {
			"$uid": {
				".read": "auth != null",
				".write": "auth != null && auth.uid === $uid"
			}
		},
		"rooms": {
			"$roomId": {
				".read": "auth != null",
				".write": "auth != null"
			}
		}
	}
}
```

## Verification Checklist

1. Open the app in two or more browsers/devices.
2. Login each user with Google.
3. Create one room and join from other users using the room code.
4. Start game and verify each player sees a secret word.
5. Let a timer expire and confirm automatic "Didn't answer" submission.
6. Complete voting and verify result + leaderboard score updates.

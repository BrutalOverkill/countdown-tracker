# iPhone test checklist

Run on the iPhone after setup. Tick each case; note anything that doesn't match "Expected".

| # | Area | Steps | Expected |
|---|---|---|---|
| 1 | Install | Add to Home Screen from Safari, open from the icon | Black splash, "Countdown" under a three-ring icon, opens full screen (no Safari bars) |
| 2 | Offline launch | Airplane mode on, open the app | App opens with "You're offline — connect to load your data" and a Retry button (no data is stored on the phone); airplane mode off → Retry loads everything |
| 2b | Signal drops while open | With the app open, airplane mode on | Data stays on screen with "Offline — changes won't save"; ticks are disabled |
| 3 | Sync by tap | Today → ↻ Sync iPhone | Shortcuts runs Countdown Sync; back in the app, steps match the Health app; "Steps synced <now>" |
| 4 | Workout | Log a workout in Strong, then ↻ Sync | Today's workout card shows it with its duration |
| 5 | Nudge | Leave PM skincare unticked, run Countdown Sync | Notification "Left today: PM skincare, …" |
| 6 | No nudge | Tick everything, run Countdown Sync | No notification |
| 7 | Nightly automation | Leave it overnight | A sync ran at 1:30 AM (Settings → Shortcut status shows the time) |
| 8 | Guard — fasting | At ~2 PM, open Swiggy | Bounced to the home screen + "🌙 Fasting — next window opens at 12:00 AM." |
| 9 | Guard — window open | At ~11:30 AM with < target logged, open Zomato | App opens normally |
| 10 | Guard — target | In a window, log food to ≥ the calorie target, open a food app | Bounced + "🛑 … kcal today — target hit. Kitchen's closed." |
| 11 | Guard — App Store | While blocked (case 8 or 10), open the App Store | Bounced to the home screen |
| 12 | Guard — no network | Airplane mode, open a food app | App opens (fails open); Shortcuts may show a network error banner |
| 12b | Guard — old token | Rotate the token in Settings but don't update Food Guard; open a food app | Notification "Food Guard couldn't check: Token not recognised…"; the app stays open. Paste the new token → case 8 works again |
| 12c | Sync — failure mid-run | Airplane mode on, run Countdown Sync | "Countdown sync failed: …" and the Shortcut stops; airplane mode off, run again → steps appear, nothing duplicated |
| 16 | Sign out | Settings → Sign out, then reopen the app | Login screen; none of your data is visible until you sign in again |
| 17 | Theme — Auto | Open the app at ~6:55 PM, then again after 7:00 PM | Bento colour tiles before 7 PM; Matrix dot-matrix look after (and back to Bento after 6 AM) |
| 18 | Theme — ◐ | In the afternoon tap ◐ | Crossfades to Matrix; still Matrix after closing/reopening; back to Auto (Bento/Matrix by clock) after the next 7 PM / 6 AM |
| 19 | Theme — Settings | Settings → Appearance → Bento | Stays Bento at night too |
| 20 | Reduce Motion | iOS Settings → Accessibility → Motion → Reduce Motion on, open the app | Numbers appear instantly; no ring fills, pops or flicker; theme switches without a crossfade |
| 21 | Fonts offline | Airplane mode, reopen the app | The "connect to load" screen still uses Space Grotesk (Bento) / Space Mono + Doto (Matrix), not a system font |
| 13 | 4 AM rollover | Tick a routine at ~1 AM; check again after 4 AM | At 1 AM it counts for the previous day; after 4 AM Today shows the new date with routines unticked |
| 14 | Perfect Day | Close every ring in a day | Confetti overlay once; not again after reopening the app that day |
| 15 | Report card | On a countdown's date, open Today | "Today! 🪔" with "See your report card →"; the card shows a grade and stats |

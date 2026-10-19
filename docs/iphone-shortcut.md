# iPhone setup

> **Anvit's phone (set up 20 Oct 2026):** Shortcuts can't read Workouts from Apple Health, so tap **Trained today ✓** on Today after a Strong session. Countdown Sync was built **steps only**: steps 1–4 below without the per-day error check (3.3), and without the nudge (steps 5–11). Food Guard was built without the error branch (step 3): if it can't reach the server, the app simply opens. In the If actions, set the input's Type to **Text**, or Shortcuts may test a property like File Size instead.

You need: the Countdown app open in Safari on the iPhone, and a **sync token** from Countdown → Settings → iPhone Shortcut → Generate token (copy it).

## 1. Install the app

Safari → https://brutaloverkill.github.io/countdown-tracker/ → sign in → Share → **Add to Home Screen** → Add. Open it from the home-screen icon from now on.

## 2. Shortcut A — "Countdown Sync" (steps, workouts, nightly nudge)

Shortcuts app → **+** → tap the name at the top → **Countdown Sync**. Add these actions in order (search for each by name):

1. **Text** → paste your token. Then **Set Variable** → name it `Token`.
2. **Find Health Samples** → Type **Steps** → Start Date **is in the last 7 days** → tap **Show More** → **Group By: Day**.
3. **Repeat with Each** (Health Samples). Inside the repeat:
   1. **Format Date** → Date: *Repeat Item → Start Date* → Date Format **Custom** → `yyyy-MM-dd`.
   2. **Get Contents of URL** → the **Sync URL** (Settings → iPhone Shortcut → Copy) → Show More:
      - Method **POST**
      - Headers: `Authorization` = `Bearer ` then the *Token* variable
      - Request Body **JSON**: add field `steps` of type **Dictionary** with two fields: `date` (Text) = *Formatted Date*, `count` (Number) = *Repeat Item* (Value).
   3. **Get Dictionary Value** → key `error` in *Contents of URL* → **If** it **has any value** → **Show Notification** `Countdown sync failed: ` + *Dictionary Value* → **Stop This Shortcut** → **End If**. (A failed day must not hide behind a later successful nudge. Re-running the Shortcut is always safe: nothing gets duplicated.)
4. **End Repeat** (added automatically).
5. *(Only if Find Health Samples offers a **Workouts** type on your phone)* **Find Health Samples** → Type **Workouts** → Start Date **is in the last 2 days**.
6. **Repeat with Each** (those samples). Inside:
   1. **Format Date** → *Repeat Item → Start Date* → **ISO 8601**, Include Time on.
   2. **Get Time Between Dates** → from *Repeat Item → Start Date* to *Repeat Item → End Date* → **Minutes**.
   3. **Get Contents of URL** → same URL/method/header → JSON field `workouts` (Dictionary): `start` (Text) = *Formatted Date*, `durationMin` (Number) = *Time Between Dates*, `name` (Text) = *Repeat Item → Type*.
   4. The same error check as step 3.3 (Get Dictionary Value `error` → If has any value → Show Notification → Stop This Shortcut).
7. **Get Contents of URL** → same URL/method/header → JSON field `ping` (Text) = `1`. (This last call returns the nudge.)
8. **Get Dictionary Value** → key `error` in *Contents of URL*.
9. **If** *Dictionary Value* **has any value** → **Show Notification** `Countdown sync failed: ` + *Dictionary Value*.
10. **Otherwise** → **Get Dictionary Value** → key `message` in *Contents of URL* (the one from step 7) → **If** it **has any value** → **Show Notification** *Dictionary Value* → **End If**.
11. **End If**.

Run it once with ▶︎ and allow Health access when asked. In the app, Today should show "Steps synced <time>".

**Automation:** Shortcuts → **Automation** → **+** → **Time of Day** → **1:30 AM**, Daily → **Run Immediately** → Next → **Countdown Sync**. (Optional: a second one at 9:30 PM.)

## 3. Shortcut B — "Food Guard" (closes food apps)

New shortcut → name **Food Guard**:

1. **Text** → paste the same token → **Set Variable** `Token`.
2. **Get Contents of URL** → the **Guard URL** (Settings → iPhone Shortcut → Copy) → POST, header `Authorization` = `Bearer ` + *Token*, JSON field `ping` (Text) = `1`.
3. **Get Dictionary Value** → key `error` in *Contents of URL* → **If** it **has any value** → **Show Notification** `Food Guard couldn't check: ` + *Dictionary Value* (the app stays open — this is "unknown", not "allowed").
4. **Otherwise** → **Get Dictionary Value** → key `message` in *Contents of URL* → **If** it **has any value** → **Go to Home Screen** → **Show Notification** *Dictionary Value* → **End If**.
5. **End If**.

**Automation:** Automation → **+** → **App** → **Choose** → tick Swiggy, Zomato, Zepto, Blinkit, Domino's, McDonald's (and any other food apps) and the **App Store** → **Is Opened** → **Run Immediately** → Next → **Food Guard**. Turn **Notify When Run** off.

When it blocks: outside your eating windows (12–1 AM, 11 AM–1 PM by default), and once today's logged calories reach your target. It's a **deterrent, not a lock**: you can switch the automation off, ordering in Safari isn't covered, and Shortcuts can't pick the App Store's "Food & Drink" category, so a newly installed food app needs ticking in this automation. If the server can't be reached, nothing is blocked.

## If something goes wrong

- **"Countdown sync failed: Token not recognised…"** or **"Food Guard couldn't check: Token not recognised…"** — you rotated the token. Paste the new one into **both** shortcuts' Text action.
- **Lost the new token before pasting it** (closed the page, copy failed) — Settings → iPhone Shortcut → Rotate token again (tap twice) and paste the fresh one into both shortcuts. The token is never stored anywhere readable, so a fresh one is always the fix.
- **No notification at all** — open the Shortcuts app → Automation and check both automations are on and set to Run Immediately.
- **Everything fails after a long break** — the free Supabase project pauses after 7 days without use. Supabase dashboard → your project → **Restore**.

# MapPin phone test checklist

Run through this on a real phone after each update. Tick each line, and note anything odd with **Menu → Send feedback**.
Do it once in the **Home Screen app** (iPhone) or the **installed app** (Android), and once in the **browser**.

## Start-up
- [ ] Menu → Settings → About shows the new version number
- [ ] First open: the welcome tour appears; swipe left and right through it; Skip and "Start planning" both close it
- [ ] Empty trip: the three start options look right (Start planning, Import a CSV, Try a sample trip) and each works
- [ ] The map starts at your location (if "Start the map at my location" is on)

## Planning
- [ ] Search a place, tap a suggestion, add it to a day
- [ ] Tap the empty search bar: your recent searches appear; Clear removes them
- [ ] Tap a place on the map: the pin lands where you tapped
- [ ] With the keyboard or a menu open, tapping the map closes it without dropping a pin
- [ ] Press and hold a card to move it; it lands where you let go
- [ ] Swipe a card left: it's deleted and Undo brings it back
- [ ] Swipe a card right: it's marked done; swipe again to undo
- [ ] Double tap a card: the map flies to its pin
- [ ] Edit a stop: Time, Stay, Cost, Spent, Booking ref and link save correctly; the booking chip opens the link
- [ ] Day ☰ → Add to calendar adds the day's stops to your calendar (the day needs a date)
- [ ] Day ☰ → Save map for offline, then turn on Airplane Mode: that area's map still shows

## Windows and menus (portrait)
- [ ] Menu opens from the bottom; every item does what it says (try each one)
- [ ] Swipe the menu down to close it
- [ ] Settings and Checklist slide up from the bottom; swipe down far enough closes them, a small drag springs back
- [ ] Home Screen app: swipe in from the left edge closes the window on top
- [ ] Browser: Back closes the window on top instead of leaving MapPin
- [ ] Checklist: tapping an item's text ticks and unticks it; there's space below the last item

## Today mode
- [ ] Today shows the day's next stop with directions, leave-by time, opening hours, weather and booking
- [ ] ‹ › arrows and a sideways swipe switch days
- [ ] Done marks the stop and moves to the next one
- [ ] Distances look sensible (measured from you only when you're nearby)

## Rotation and layout
- [ ] Turn the phone to landscape and back: menu bar, map buttons and the list stay in the right places
- [ ] After rotating and after typing, menu taps still hit the item you tap
- [ ] Layers button (bottom right of the map) switches Light / Dark / Satellite and route styles
- [ ] Nothing important is hidden under the clock, the Dynamic Island or the home bar

## Sharing and data
- [ ] Share → View only: the link opens the trip read-only on another device
- [ ] Share → Editable copy: the link opens a copy that can be changed
- [ ] Export CSV, then Import CSV on another device: stops, bookings and spending come across
- [ ] Close and reopen the app: everything is still there (Autosave)

## 1.4.1 checks
- Hold a card and drag: the card follows your finger with its background and border; a dashed outline shows where it will land.
- Hold a card still (about half a second): it gets selected and the phone buzzes while your finger is still down. Let go: nothing else opens. Keep moving instead: it turns into moving the card and the selection is undone.
- Hold a card, then scroll the list with a second finger. Lift the second finger: the card stays in your hand until you let go of it.
- Double-tap a card, then tap All days straight away: the map zooms out to every stop and no popup jumps open.
- Menu → Expenses (or tap the trip total): Days / Category / Stops, set a trip budget, tap a day to jump to it, tap a stop to edit its cost.

## 1.4.2 checks
- Menu → Import from link: paste a Google Sheet link (Share → Anyone with the link). The trip loads with the sheet's name for days ("Day title" column) and the link is remembered.
- Change the sheet (edit a time, add a row, delete a row), then Menu → Import from link → Refresh from link. Spent amounts, notes and pins you added in MapPin stay; the toast says what changed and Undo puts it back.
- Import CSV over an existing trip: it asks first, the new trip takes the file's name, and the old trip's checklist doesn't come along.
- Pull the list sheet all the way up, import a CSV, then pull it down: the map shows all the pins (it used to stay zoomed in on one spot).
- Tap a card's notes, then tap another card to stop editing: no card stays highlighted.
- Double-tap a pin: the list opens halfway and scrolls to that stop's card, which flashes; the pin's popup stays open.

## 1.4.3 checks
- Import a file while a trip is open: choose "Update this trip" (your notes, spent amounts and pins stay) or "Start a new trip".
- Import a KML exported from Google My Maps: each layer becomes a day named after the layer.
- Import Google Takeout "Saved Places.json" or a saved-list CSV: places without coordinates are looked up by name.
- Open a pin's popup: "Show in the list" is a labelled button and the popup buttons are bigger on phones.
- "Sample trip loaded" no longer stays on screen after importing your own trip.

## 1.4.4 checks
- Import a private trip link (…/p/<name>.enc#k=…): the trip loads, the import window shows "Private", and "Update automatically when MapPin opens" is ticked.
- After the private trip is updated on GitHub, close and reopen MapPin: a message says what changed, with Undo.

## 1.4.5 checks
- Scroll the day chips far to the right: Today stays pinned on the left; today's day chip has a green dot; the chosen day scrolls into view.
- In Today mode, swipe to another day: a green "Today" button appears in the card; tapping it (or the Today chip) jumps back to today.

## 1.4.6 checks
- Finish today's stops in Today mode: a "Tomorrow" card shows the first stop and any journeys, new hotel or fixed times, with See tomorrow.
- With location allowed, stay at one of today's stops for 3 minutes with MapPin open: it asks "You're at …. Mark it done?" (Done / Not now / Stop asking; also in Settings). Hotels are skipped.
- In Today mode on a phone, the trip summary card is hidden to give the day more room.

## 1.4.7 checks
- Straight-line routes: between cards you see a journey estimate (e.g. "~9 min walk · 500 m"); it turns amber with "tight" when the planned times don't leave enough time.
- Stops named "(missed)" or ticked Skipped in their details fold into a "Skipped (n)" row at the end of the day, with Bring back. In Today mode, "Skip this stop" does the same.
- Menu → Bookings lists every booking reference and link by day; tap a reference to copy it.

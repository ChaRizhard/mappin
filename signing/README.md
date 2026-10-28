`debug.keystore` is a **test-only** signing key (standard Android debug key, password `android`).
It keeps every GitHub build signed the same way, so a new test build installs over the old one
without deleting your trips. Do **not** use it for Google Play: create a private upload key for
store releases (see SETUP.md, part 6) and never put that one on GitHub.

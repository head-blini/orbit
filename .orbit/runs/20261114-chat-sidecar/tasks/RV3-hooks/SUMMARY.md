RV3-hooks: is_installed(path, port, token) true only if all EVENTS have an Orbit handler with exact url+token.
Before: cargo test hooks -> 2 FAILED (is_installed_requires_matching_port_and_token, install_after_port_change_leaves_one_new_entry), 12 passed.
After: cargo build clean; cargo test -> 109 passed, 0 failed.
install already stripped old Orbit entries (reinstall_replaces_without_duplicates); new test confirms 1 entry/new port.

# Binding Chrome Window to OBS at Startup (X11, Xcomposite)

Author: System Architecture Specification Purpose: Reliable capture of a
Chrome window in OBS when launched automatically by a NodeJS service.

------------------------------------------------------------------------

# 1. Problem Description

When OBS uses **Window Capture (Xcomposite)** on Linux (X11), the
capture is tied to an internal X11 **Window ID (XID)**. Chrome may
occasionally recreate its window due to compositor changes, GPU resets,
or fullscreen toggles.

When this happens:

-   The original Window ID becomes invalid.
-   OBS continues trying to capture the old window.
-   The capture becomes blank or OBS may crash.

Therefore we must **bind the capture dynamically** each time the system
starts.

The solution:

1.  Start Chrome from the application.
2.  Detect the Chrome window ID.
3.  Update the OBS input settings using **obs-websocket**.
4.  OBS captures the correct window.

------------------------------------------------------------------------

# 2. High Level Architecture

System components:

NodeJS Service ↓ Launch Chrome ↓ Detect Chrome X11 Window ID ↓ Update
OBS source through obs-websocket ↓ OBS captures the correct window

Diagram:

NodeJS App\
│\
├── spawn Chrome\
│\
├── detect window id (xdotool)\
│\
└── update OBS source (obs-websocket)

------------------------------------------------------------------------

# 3. System Requirements

Environment assumptions:

-   OS: Kubuntu / Ubuntu with X11
-   OBS installed
-   obs-websocket plugin enabled
-   xdotool installed
-   Chrome installed
-   NodeJS application controlling startup

Required packages:

``` bash
sudo apt install xdotool
```

OBS plugin:

    obs-websocket

Default websocket port:

    4455

------------------------------------------------------------------------

# 4. Chrome Launch Requirements

Chrome must be started in a deterministic way to avoid window
recreation.

Required launch parameters:

``` bash
google-chrome --app=https://example.com --user-data-dir=/tmp/dnd-chrome --window-size=1920,1080 --window-position=0,0 --disable-session-crashed-bubble --disable-infobars --no-first-run
```

Explanation:

  Flag                               Purpose
  ---------------------------------- ------------------------------
  --app                              Removes browser UI
  --user-data-dir                    Fixed profile
  --window-size                      Prevents resize events
  --window-position                  Predictable window placement
  --disable-session-crashed-bubble   Prevent crash dialog
  --no-first-run                     Avoid onboarding UI

------------------------------------------------------------------------

# 5. Detecting the Chrome Window

After Chrome starts we must obtain the **X11 Window ID**.

Command:

``` bash
xdotool search --onlyvisible --class chrome
```

Example output:

    58720259

This number is the **XID**.

Validation command:

``` bash
xwininfo -id 58720259
```

------------------------------------------------------------------------

# 6. Waiting for Chrome Window

Chrome takes time to initialize.

The implementation must:

1.  Spawn Chrome.
2.  Wait until the window appears.

Recommended retry logic:

Retry every 500ms for up to 10 seconds.

Pseudo logic:

    repeat
        search window
    until window found OR timeout

------------------------------------------------------------------------

# 7. OBS Source Configuration

OBS scene must already contain a **Window Capture source**.

Source configuration:

    Source Name: ChromeCapture
    Type: Window Capture (Xcomposite)

Initial window value does not matter.

It will be replaced dynamically.

------------------------------------------------------------------------

# 8. Updating OBS Source via WebSocket

OBS websocket API method:

    SetInputSettings

Example payload:

``` json
{
  "inputName": "ChromeCapture",
  "inputSettings": {
    "window": "58720259"
  }
}
```

This tells OBS to capture the specified window ID.

------------------------------------------------------------------------

# 9. NodeJS Implementation Example

Pseudo code:

``` javascript
spawnChrome()

await waitForWindow()

const windowId = detectWindow()

obs.call("SetInputSettings", {
  inputName: "ChromeCapture",
  inputSettings: {
    window: windowId.toString()
  }
})
```

------------------------------------------------------------------------

# 10. Detect Window in NodeJS

Example function:

``` javascript
const { execSync } = require('child_process')

function getChromeWindow() {
  const output = execSync(
    'xdotool search --onlyvisible --class chrome'
  ).toString()

  return output.split('\n')[0]
}
```

------------------------------------------------------------------------

# 11. Startup Sequence

Final startup order:

1.  Start NodeJS service
2.  Launch Chrome
3.  Wait until window appears
4.  Retrieve X11 window id
5.  Connect to OBS websocket
6.  Update OBS source
7.  Activate scene

Sequence diagram:

NodeJS │ ├─ spawn Chrome │ ├─ detect XID │ ├─ connect OBS websocket │ └─
bind source to window

------------------------------------------------------------------------

# 12. Error Handling

Possible errors:

Window not found

Solution:

Retry detection for 10 seconds.

OBS websocket unavailable

Solution:

Retry connection.

Chrome crashed

Solution:

Restart Chrome and rebind window.

------------------------------------------------------------------------

# 13. Recommended Improvements

To improve reliability:

Disable GPU in Chrome if issues appear:

    --disable-gpu

Ensure OBS launches after Chrome if possible.

Add watchdog to detect Chrome termination.

------------------------------------------------------------------------

# 14. Final Result

After implementation the system will:

-   Launch Chrome automatically
-   Detect the correct window
-   Bind OBS capture dynamically
-   Prevent window capture loss

This ensures stable operation of the pipeline:

Chrome → OBS → Projector

------------------------------------------------------------------------

# 15. Operator Setup Guide

## Creating the Window Capture Source in OBS

1. Open OBS and go to the target scene.
2. Add a new source: **Window Capture (Xcomposite)**.
3. Set the source name to match the value of `OBS_CHROME_SOURCE_NAME` in your `.env` file.
   - Example: if `OBS_CHROME_SOURCE_NAME=ChromeCapture`, the OBS source must be named exactly `ChromeCapture`.
4. The initial window selection does not matter — it will be replaced automatically.

## Environment Variable

Add to your `.env`:

```
OBS_CHROME_SOURCE_NAME=ChromeCapture
```

If this variable is not set, the automatic window binding is disabled.

## How It Works

- Every time the service connects (or reconnects) to OBS WebSocket, it runs `xdotool search --onlyvisible --class chrome` to find the Chrome X11 Window ID.
- It retries every 500 ms for up to 10 seconds waiting for Chrome to appear.
- On success, it calls OBS `SetInputSettings` to bind the source to the detected window.
- If binding fails (source not found, OBS error, timeout), the error is logged as a warning and the service continues normally.

**Without this step** (source not created in OBS), the capture source will remain empty even if the service runs correctly.

------------------------------------------------------------------------

---
'@tanstack/devtools': patch
---

Delegate the full Solid `DelegatedEvents` set on the picture-in-picture popup
document so delegated handlers rendered into the detached window fire. The
hand-picked nine-event list omitted `dblclick`, so the splitter's double-click
reset (and any other delegated handler outside that list) silently did nothing
in PiP mode.

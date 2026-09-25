# The Marquee disk image's window, for dmgbuild (.github/workflows/apps.yml):
#   dmgbuild -s mac/Scripts/dmg-settings.py -D app=<Marquee.app> "Marquee 0.31.0" Marquee-0.31.0.dmg
# The background (Design/DMG, from generate-dmg-background.mjs) draws the
# arrow and the text; the icon positions here match it. Written straight
# into the image's .DS_Store, so no Finder scripting and nothing to go
# flaky on a headless build machine.
# Run from the repo root (dmgbuild runs this without a __file__), or pass
# -D design=<folder>.
import os.path

application = defines.get("app", "Marquee.app")  # noqa: F821 (dmgbuild provides `defines`)
design = defines.get("design", os.path.join("mac", "Design", "DMG"))  # noqa: F821

format = "UDZO"
filesystem = "HFS+"
files = [application, os.path.join(design, "Read Me.txt")]
symlinks = {"Applications": "/Applications"}
hide_extension = ["Marquee.app"]

# Built from background.png and background@2x.png, so it's sharp on Retina.
background = defines.get("background", os.path.join(design, "background.tiff"))  # noqa: F821

# 440 of content under the title bar.
window_rect = ((200, 140), (640, 468))
default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
arrange_by = None
icon_size = 100
text_size = 13
label_pos = "bottom"
icon_locations = {
    "Marquee.app": (170, 212),
    "Applications": (470, 212),
    "Read Me.txt": (556, 350),
}

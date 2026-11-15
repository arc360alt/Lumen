## TODO:

## Completed:

- When I close and open my laptops lid (nvidia one) it cannot recover after opening the lid and the fans just run at full speed on a black screen without it coming back (I needed to force shut it down and then start it up again to fix it) (NVIDIA S0ix sleep enabled in /etc/modprobe.d/lumen-nvidia-sleep.conf; needs testing on the Legion. DE side: LIQUIDDESKTOP-REQUESTS.md #11)
- The updater app does not follow the rest of the systems theming (its in light mode when LiquidDesktop is in dark mode) (follows LiquidDesktop's Appearance now; LIQUIDDESKTOP-REQUESTS.md #10 for a cleaner way)
- Fix a REDICULOUS amount of grapical bugs happening on the live image on nvidia, this ranges from parts of the screen flashing, the boot screen persisting, dissapearing, and then showing again and not going away untill the system is not shut down(the boot screen inside the DE not the plymouth one) and the installer window just being blur and not having any content in it, it was just a paine of blur that I could move around. This might also be because of my 16:10 display on my laptop, but most of the other bugs seemed to be Grapical with software+nvidia rendering on this electron baised advanced DE. If any of these issues you think might be an issue with the DE, finish what your doing whth the OS, and then make a prompt for my agent on the DE that I can send to it to fix the issues you found to be related to the Desktop Enviroment instead of the OS. (OS side done; DE side: prompt in LIQUIDDESKTOP-REQUESTS.md #6)
- Customise the fastfetch ascii art and pre-install fastfetch
- Add a custom Lumen plymouth bootscreen
- Make the LiquidDesktop version that is installed with the DE auto update every build to the newest github commit (to ensure all new packages included in the PKGBUILD are being installed into the OS to prevent errors)
- Add a drivers section to the installer so users can install proper AMD, Intel, or Nvidia (Nvidia especily should be the focus for this) drivers onto their computer in the installer so they dont need to do it manualy later on barely working graphics
- Make sure WiFi Drivers for the Lenovo 16IRX8H are installed so I can test the Nvidia drivers on my own Nvidia Laptop to test them

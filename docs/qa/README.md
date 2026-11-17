# Variable management browser checks

These captures use synthetic variables on an isolated Paseo 0.15.3 daemon. The preview renders the production React Native components through React Native Web with a thin SDK adapter forwarding real plugin RPCs. Its toolbar is a preview harness, not Paseo app chrome. Native iOS/Android rendering and the full desktop shell were not exercised.

Browser checks covered replacing a value inside its card without changing the Add form, visible save and delete confirmations, canceling removal, revealing and copying the updated value, filtering across two projects, and rejecting a search term present only in a value. The compact light layout had no horizontal overflow.

- [Inline replacement, desktop dark](replacement-desktop.png)
- [Compact removal confirmation, desktop dark](remove-desktop.png)
- [Inline replacement, compact light](replacement-mobile.png)
- [Cross-project search, desktop dark](search-desktop.png)

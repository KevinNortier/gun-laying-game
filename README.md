# Gun Laying

A browser game where you run the fire direction centre (FDC) of an 81 mm mortar platoon. A forward observer
calls for fire over the radio; you plot the target on a topographic map, work out deflection, charge and
elevation from the firing tables, and adjust onto the target from the observer's corrections.

**Play:** https://kevinnortier.github.io/gun-laying-game/

## Features

- Procedural MGRS maps in four themes (temperate, boreal, arid, mountain) with contours, rivers, lakes,
  woods, roads and villages, NATO symbols and a declination diagram
- Manual plotting tools: range arm, target grid and your own markers
- Ballistic model with firing tables generated from it: height difference, wind, temperature, density and
  propellant temperature all matter
- Mission types: grid, polar and shift from a known point, adjust fire or fire for effect, optional
  non-standard weather with a met message
- Training course with six stages, free play, and an in-game glossary of terms

## Running locally

No build step or install: open `index.html` in a browser. A map can be shared with URL parameters, e.g.
`index.html?seed=42&theme=mountain`.

Settings and course progress are stored in the browser's local storage.

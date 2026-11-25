// Weapon systems. Fictional, loosely based on real 81 mm mortars (bomb mass, charge system,
// elevation limits and range envelope are in the same ballpark; the numbers are our own).
(function (GL) {
  'use strict';

  GL.WEAPONS = {
    m81: {
      id: 'm81',
      name: '81 mm mortar "M81"',
      ammunition: 'HE M81A1',
      calibre: 81,
      diameter: 0.081, // m
      mass: 4.1, // kg
      // Drag coefficient against Mach number (fin-stabilised bomb).
      cd: [
        [0.0, 0.13],
        [0.5, 0.13],
        [0.7, 0.145],
        [0.8, 0.175],
        [0.9, 0.24],
        [1.0, 0.36],
        [1.2, 0.4],
      ],
      // Muzzle velocity per charge (number of propellant increments) at 21 °C, tuned so the
      // maximum ranges at 800 mils are 500 / 1500 / 2700 / 4000 / 5600 m.
      charges: [
        { charge: 0, mv: 71.4 },
        { charge: 1, mv: 128.7 },
        { charge: 2, mv: 181.3 },
        { charge: 3, mv: 233.9 },
        { charge: 4, mv: 308.2 },
      ],
      propTempCoeff: 0.0012, // fractional MV change per °C of propellant temperature
      minElev: 800, // mils
      maxElev: 1511, // mils
      minRange: 80, // metres
      maxRange: 5600, // metres
    },
  };
})((window.GL = window.GL || {}));

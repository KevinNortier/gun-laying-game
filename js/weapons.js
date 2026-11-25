// Weapon systems. Fictional, loosely based on real 81 mm mortars.
// Ballistics and firing tables are added in milestone 3.
(function (GL) {
  'use strict';

  GL.WEAPONS = {
    m81: {
      id: 'm81',
      name: '81 mm mortar "M81"',
      calibre: 81,
      minRange: 80, // metres
      maxRange: 5600, // metres
    },
  };
})((window.GL = window.GL || {}));

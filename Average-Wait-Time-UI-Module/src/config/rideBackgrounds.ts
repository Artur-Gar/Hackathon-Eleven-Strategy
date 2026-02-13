/**
 * Ride Background Image Mapping
 *
 * This module maps ride names to their AI-generated background images.
 * Images are imported as ES6 modules for Vite bundling, lazy-loading, and caching.
 *
 * HOW TO REPLACE WITH OFFICIAL PHOTOS:
 * 1. Place new images in src/assets/rides/ (any format: jpg, png, webp)
 * 2. Update the import path below for the corresponding ride
 * 3. No changes needed in RideTile or any other component
 *
 * HOW TO ADD A NEW RIDE:
 * 1. Add the image to src/assets/rides/
 * 2. Import it below
 * 3. Add an entry to rideBackgrounds with the exact ride name as key
 *
 * If a ride name has no entry here, the tile gracefully falls back
 * to a soft gradient background defined in CSS.
 */

import bumperCars from "@/assets/rides/bumper-cars.jpg";
import bungeeJump from "@/assets/rides/bungee-jump.jpg";
import circusTrain from "@/assets/rides/circus-train.jpg";
import crazyDance from "@/assets/rides/crazy-dance.jpg";
import dizzyDropper from "@/assets/rides/dizzy-dropper.jpg";
import dropTower from "@/assets/rides/drop-tower.jpg";
import flyingCoaster from "@/assets/rides/flying-coaster.jpg";
import freeFall from "@/assets/rides/free-fall.jpg";
import giantWheel from "@/assets/rides/giant-wheel.jpg";
import gigaCoaster from "@/assets/rides/giga-coaster.jpg";
import goKarts from "@/assets/rides/go-karts.jpg";
import hauntedHouse from "@/assets/rides/haunted-house.jpg";
import himalayaRide from "@/assets/rides/himalaya-ride.jpg";
import invertedCoaster from "@/assets/rides/inverted-coaster.jpg";
import kiddieCoaster from "@/assets/rides/kiddie-coaster.jpg";
import merryGoRound from "@/assets/rides/merry-go-round.jpg";
import ozTheatre from "@/assets/rides/oz-theatre.jpg";
import rapidsRide from "@/assets/rides/rapids-ride.jpg";
import rollerCoaster from "@/assets/rides/roller-coaster.jpg";
import spinningCoaster from "@/assets/rides/spinning-coaster.jpg";
import spiralSlide from "@/assets/rides/spiral-slide.jpg";
import supermanRide from "@/assets/rides/superman-ride.jpg";
import swingRide from "@/assets/rides/swing-ride.jpg";
import verticalDrop from "@/assets/rides/vertical-drop.jpg";
import waterRide from "@/assets/rides/water-ride.jpg";
import zipline from "@/assets/rides/zipline.jpg";

/** Map of ride name → imported background image URL */
export const rideBackgrounds: Record<string, string> = {
  "Bumper Cars": bumperCars,
  "Bungee Jump": bungeeJump,
  "Circus Train": circusTrain,
  "Crazy Dance": crazyDance,
  "Dizzy Dropper": dizzyDropper,
  "Drop Tower": dropTower,
  "Flying Coaster": flyingCoaster,
  "Free Fall": freeFall,
  "Giant Wheel": giantWheel,
  "Giga Coaster": gigaCoaster,
  "Go-Karts": goKarts,
  "Haunted House": hauntedHouse,
  "Himalaya Ride": himalayaRide,
  "Inverted Coaster": invertedCoaster,
  "Kiddie Coaster": kiddieCoaster,
  "Merry Go Round": merryGoRound,
  "Oz Theatre": ozTheatre,
  "Rapids Ride": rapidsRide,
  "Roller Coaster": rollerCoaster,
  "Spinning Coaster": spinningCoaster,
  "Spiral Slide": spiralSlide,
  "Superman Ride": supermanRide,
  "Swing Ride": swingRide,
  "Vertical Drop": verticalDrop,
  "Water Ride": waterRide,
  "Zipline": zipline,
};

import { useState } from "react";
import { motion } from "framer-motion";
import { RideData } from "@/lib/DataProcessor";
import { rideDescriptions, AppConfig } from "@/config/AppConfig";
import { rideBackgrounds } from "@/config/rideBackgrounds";
import { StatusBadge } from "./StatusBadge";
import { DetailedChart } from "./DetailedChart";

interface RideTileProps {
  ride: RideData;
}

/**
 * RideTile renders a flip card for each ride.
 *
 * BACKGROUND IMAGE SYSTEM:
 * - Each tile has an AI-generated background from rideBackgrounds mapping
 * - A dark gradient overlay ensures text/chart readability
 * - Images are lazy-loaded via <img loading="lazy"> for mobile performance
 * - If no image is found for a ride name, a soft CSS gradient fallback is used
 * - To swap to official ride photos, update src/config/rideBackgrounds.ts only
 */
export function RideTile({ ride }: RideTileProps) {
  const [flipped, setFlipped] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const description = rideDescriptions[ride.name] || null;
  const canFlip = ride.available;
  const bgImage = rideBackgrounds[ride.name] || null;

  /** Shared background layer used on both front and back of the tile */
  const BackgroundLayer = () => (
    <>
      {/* AI-generated background image with lazy loading */}
      {bgImage && !imgError && (
        <img
          src={bgImage}
          alt=""
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            imgLoaded ? "opacity-90" : "opacity-0"
          }`}
          style={{ filter: "blur(2px)" }}
        />
      )}
      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/70 to-card/50" />
      {/* Fallback gradient if no image or load error */}
      {(!bgImage || imgError) && (
        <div className="absolute inset-0 bg-gradient-to-br from-card to-secondary/30" />
      )}
    </>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      whileHover={canFlip ? { scale: AppConfig.animation.hoverScale } : {}}
      className="flip-container w-full"
      style={{ minHeight: 220 }}
      onMouseEnter={() => canFlip && setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
    >
      <div
        className={`flip-inner relative w-full ${flipped ? "flipped" : ""}`}
        style={{
          cursor: canFlip ? "pointer" : "default",
          minHeight: 220,
        }}
      >
        {/* FRONT — Name + Description with background image */}
        <div
          className={`flip-front absolute inset-0 park-card p-4 flex flex-col overflow-hidden ${
            !ride.available ? "park-card-unavailable" : ""
          }`}
        >
          <BackgroundLayer />

          {/* Content layer (above background) */}
          <div className="relative z-10 flex items-end justify-end">
            <StatusBadge available={ride.available} />
          </div>

          <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center gap-2">
            <h3 className="font-extrabold text-lg text-foreground leading-tight">
              {ride.name}
            </h3>
            {ride.available ? (
              description ? (
                <p className="text-muted-foreground text-xs font-semibold px-2">
                  {description}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  Hover to see wait times
                </p>
              )
            ) : (
              <p className="text-muted-foreground text-xs font-semibold">
                Unavailable currently
              </p>
            )}
          </div>
        </div>

        {/* BACK — Chart with background image */}
        {canFlip && (
          <div className="flip-back absolute inset-0 park-card p-4 flex flex-col overflow-hidden">
            <BackgroundLayer />

            <div className="relative z-10 flex items-start justify-between mb-1">
              <h3 className="font-extrabold text-sm text-foreground leading-tight pr-2">
                {ride.name}
              </h3>
              <StatusBadge available={ride.available} />
            </div>

            <div className="relative z-10 flex-1 flex items-end">
              <DetailedChart
                data={ride.hourlyData}
                currentHourIndex={ride.currentHourIndex}
              />
            </div>

            <p className="relative z-10 text-[10px] text-muted-foreground mt-2 text-center">
              Hover off to flip back
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

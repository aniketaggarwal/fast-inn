// Hand-rolled outline icons instead of a new dependency — this project
// only ever needs a dozen or so, and every one already existing elsewhere
// in this repo (sharp/tesseract/face-api, all installed for a real
// reason) argues against reaching for a library just for glyphs.
function Icon({ children, className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {children}
    </svg>
  );
}

export function StarIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.1 1.1 5.9L12 16.8l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.7L12 3.5z" />
    </Icon>
  );
}

export function MapPinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 005 9.5C5 14.9 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
    </Icon>
  );
}

export function WifiIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 8.5a15 15 0 0119 0" />
      <path d="M5.8 12.2a10.5 10.5 0 0112.4 0" />
      <path d="M9 15.8a5.7 5.7 0 016 0" />
      <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PoolIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 17c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0" />
      <path d="M6 13V6a2 2 0 012-2h3l7 7" />
      <path d="M13 13V8" />
    </Icon>
  );
}

export function BreakfastIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 3v7a4 4 0 004 4h1a4 4 0 004-4V3" />
      <path d="M17 8h1.5a2.5 2.5 0 010 5H17" />
      <path d="M4 21h13" />
      <path d="M8 14v3M12 14v3" />
    </Icon>
  );
}

export function DeskIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0116 0v2" />
      <path d="M12 12v3" />
    </Icon>
  );
}

export function RestaurantIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 3v7a2 2 0 002 2 2 2 0 002-2V3M8 12v9" />
      <path d="M16 3c-1.1 0-2 1.3-2 4s.9 4 2 4 0 9 0 9V3z" />
    </Icon>
  );
}

export function SnowflakeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11" />
    </Icon>
  );
}

export function ParkingIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 16V8h3.2a2.4 2.4 0 010 4.8H9" />
    </Icon>
  );
}

export function GymIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2 12h2M20 12h2M6 8v8M18 8v8M6 12h12" />
    </Icon>
  );
}

export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 18h18M12 6a6 6 0 00-6 6v3h12v-3a6 6 0 00-6-6z" />
      <circle cx="12" cy="4" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function SpaIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21c4-1 6-4 6-8 0-3-2-5-2-5s-1 2-3 2-3-2-3-2-2 2-2 5c0 4 2 7 4 8z" />
    </Icon>
  );
}

export function PlaneIcon(props) {
  return (
    <Icon {...props}>
      <path d="M10.5 3.5l6 6-3.2 1.1L16 14l-2.3.5-1.5 3.5-1.6-4-4-1.6 3.5-1.5.5-2.3-3.6 2.7 1.1-3.2 6-6z" transform="translate(0 0)" />
    </Icon>
  );
}

export function PawIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="9" r="1.6" />
      <circle cx="12" cy="6.5" r="1.6" />
      <circle cx="17" cy="9" r="1.6" />
      <path d="M12 21c-3 0-5-1.6-5-3.7 0-2.3 2.3-3.8 5-3.8s5 1.5 5 3.8c0 2.1-2 3.7-5 3.7z" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Icon>
  );
}

export function ShieldCheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Icon>
  );
}

export function BedIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6" />
      <path d="M3 18v2M21 18v2" />
      <path d="M3 13V7a1 1 0 011-1h6a1 1 0 011 1v3" />
      <path d="M13 10h5.5a1.5 1.5 0 011.5 1.5V13" />
    </Icon>
  );
}

const AMENITY_ICONS = {
  "Free WiFi": WifiIcon,
  "Swimming Pool": PoolIcon,
  "Breakfast Included": BreakfastIcon,
  "24/7 Front Desk": DeskIcon,
  Restaurant: RestaurantIcon,
  "Air Conditioning": SnowflakeIcon,
  "Free Parking": ParkingIcon,
  Gym: GymIcon,
  "Room Service": BellIcon,
  Spa: SpaIcon,
  "Airport Shuttle": PlaneIcon,
  "Pet Friendly": PawIcon,
};

export function AmenityIcon({ name, className }) {
  const Cmp = AMENITY_ICONS[name] || CheckIcon;
  return <Cmp className={className} />;
}

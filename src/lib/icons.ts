import {
  Home, ShoppingCart, Car, Shirt, PiggyBank, Package, Landmark,
  Utensils, Coffee, Bus, Train, Fuel, Plug, Wifi, Phone, Shield,
  HeartPulse, Dumbbell, Baby, Dog, Gift, Plane, Film, Music,
  BookOpen, GraduationCap, Wrench, Scissors, Sparkles, CreditCard,
  Banknote, TrendingUp, Receipt, Tag, Zap, Hammer, Bike, Smartphone,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ikonregister. Kategorier lagrer bare nøkkelen, slik at lagrede data
 * aldri avhenger av komponentreferanser.
 */
export const ICONS: Record<string, LucideIcon> = {
  home: Home, cart: ShoppingCart, car: Car, shirt: Shirt, piggy: PiggyBank,
  package: Package, bank: Landmark, utensils: Utensils, coffee: Coffee,
  bus: Bus, train: Train, fuel: Fuel, plug: Plug, wifi: Wifi, phone: Phone,
  shield: Shield, health: HeartPulse, gym: Dumbbell, baby: Baby, pet: Dog,
  gift: Gift, plane: Plane, film: Film, music: Music, book: BookOpen,
  school: GraduationCap, wrench: Wrench, scissors: Scissors, sparkles: Sparkles,
  card: CreditCard, cash: Banknote, trend: TrendingUp, receipt: Receipt,
  tag: Tag, zap: Zap, hammer: Hammer, bike: Bike, smartphone: Smartphone,
};

export const ICON_KEYS = Object.keys(ICONS);

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Tag;
}

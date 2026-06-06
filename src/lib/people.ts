import type { Person } from "./types";

export const PEOPLE: Person[] = [
  {
    id: "iris",
    name: "Iris",
    age: 29,
    city: "Lisbon",
    occupation: "Translator",
    portrait:
      "Keeps a list of bookstores in every city she visits. Reads on rainy afternoons with the window cracked, even in winter. Laughs at her own jokes before finishing them.",
    signals: ["reading", "rain", "quiet", "funny", "travel"],
  },
  {
    id: "june",
    name: "June",
    age: 31,
    city: "Brooklyn",
    occupation: "Architect",
    portrait:
      "Walks home the long way. Believes good buildings should feel like they're listening. Makes coffee like it's a small ceremony — but quick to share it.",
    signals: ["coffee", "city", "quiet", "kind", "art"],
  },
  {
    id: "theo",
    name: "Theo",
    age: 33,
    city: "Berlin",
    occupation: "Composer",
    portrait:
      "Writes piano pieces nobody asked for. Cooks the same pasta every Tuesday and pretends to be surprised when it's good. Honest in a way that takes a minute to get used to.",
    signals: ["music", "cooking", "brave", "quiet"],
  },
  {
    id: "mira",
    name: "Mira",
    age: 28,
    city: "Kyoto",
    occupation: "Ceramicist",
    portrait:
      "Spends mornings at the wheel and afternoons in the woods. Picks up smooth stones and gives them as gifts. Doesn't fill silences.",
    signals: ["art", "outdoors", "quiet", "morning"],
  },
  {
    id: "hugo",
    name: "Hugo",
    age: 34,
    city: "Mexico City",
    occupation: "Documentary editor",
    portrait:
      "Curious about strangers in the way that makes them tell him things. Keeps a notebook of overheard sentences. Dances badly and on purpose.",
    signals: ["film", "curious", "funny", "writing", "city"],
  },
  {
    id: "noa",
    name: "Noa",
    age: 30,
    city: "Tel Aviv",
    occupation: "Pediatrician",
    portrait:
      "Patient with people, impatient with bad design. Cries at the end of good novels. Owns one truly excellent knife and uses it for everything.",
    signals: ["kind", "reading", "cooking", "brave"],
  },
  {
    id: "soren",
    name: "Søren",
    age: 32,
    city: "Copenhagen",
    occupation: "Bike-shop owner",
    portrait:
      "Rides at dawn. Believes a good repair is a small love letter to whoever rides next. Reads Tranströmer between customers.",
    signals: ["outdoors", "morning", "reading", "quiet"],
  },
  {
    id: "amara",
    name: "Amara",
    age: 27,
    city: "Lagos",
    occupation: "Illustrator",
    portrait:
      "Draws people on the train without them noticing. Hosts long dinners with too many candles. Asks the question you weren't quite ready to answer.",
    signals: ["art", "curious", "city", "cooking"],
  },
  {
    id: "leo",
    name: "Leo",
    age: 35,
    city: "Buenos Aires",
    occupation: "Bookseller",
    portrait:
      "Recommends the book you didn't know you needed. Lights candles at midnight. Walks the dog under streetlamps and calls it thinking.",
    signals: ["reading", "night", "animals", "city", "quiet"],
  },
  {
    id: "wren",
    name: "Wren",
    age: 30,
    city: "Edinburgh",
    occupation: "Climate researcher",
    portrait:
      "Earnest about the world without being heavy. Keeps a press of wildflowers on the kitchen wall. Texts you the moon when it's full.",
    signals: ["outdoors", "kind", "ambitious", "curious"],
  },
  {
    id: "kai",
    name: "Kai",
    age: 32,
    city: "Vancouver",
    occupation: "Photographer",
    portrait:
      "Hikes alone, eats with company. Shoots film because it makes him slow down. Quiet until something is funny — then loud, briefly.",
    signals: ["outdoors", "film", "quiet", "funny"],
  },
  {
    id: "elena",
    name: "Elena",
    age: 29,
    city: "Rome",
    occupation: "Pastry chef",
    portrait:
      "Wakes before the city does. Thinks dessert is the most honest course. Reads poetry in the back of the bakery between batches.",
    signals: ["cooking", "morning", "reading", "art"],
  },
];

export function getPersonById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=F4F4F5,E5E5E5,EFEFEF,FAFAFA&radius=50`;
}

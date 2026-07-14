// The news widget's backend, sandbox edition: Google News RSS blocks
// browser CORS, so the demo serves fixed, plainly fictional headlines per
// topic with ages synthesized from "now" — enough to show exactly how the
// card reads without impersonating a real news day.

import type { Headline, HeadlinesResponse } from "../widgets/newsApi";

const STUBS: Record<string, [string, string][]> = {
  top: [
    ["Region votes to keep beloved ferry line running through 2040", "The Harbor Ledger"],
    ["Community solar project powers its thousandth home", "Daybreak Wire"],
    ["Historic rail depot reopens as a public market", "The Junction Post"],
    ["Volunteers finish trail linking three towns after decade of work", "Northside Gazette"],
    ["City library breaks lending record for the third straight year", "The Evening Standard-Bee"],
    ["New crosswalk design cuts near-misses at busy corner", "Metro Current"],
  ],
  world: [
    ["Coastal nations sign expanded reef restoration accord", "World Desk Daily"],
    ["High-speed sleeper train links two capitals for the first time", "The Continental"],
    ["Ancient orchard rediscovered behind mountain monastery", "Global Field Notes"],
    ["Island microgrid runs a full year on renewables alone", "The Meridian"],
    ["Translators finish decade-long dictionary of vanishing dialect", "World Desk Daily"],
    ["Migration season sets record at wetland crossing", "The Continental"],
  ],
  nation: [
    ["National parks pilot quiet hours to protect dawn chorus", "The Capitol Ledger"],
    ["Rural broadband push reaches final county on the map", "Union Wire"],
    ["Bridge named for local teacher opens to first commuters", "The Capitol Ledger"],
    ["Census of town squares finds gazebos staging a comeback", "Union Wire"],
    ["Interstate wildflower program turns medians into meadows", "The Plainsman"],
    ["Mail carriers log millionth package delivered by cargo bike", "The Plainsman"],
  ],
  business: [
    ["Hardware co-op expands tool library to five new branches", "Ledger & Line"],
    ["Regional grocer commits to reusable crate system", "Commerce Daily"],
    ["Family foundry retools to cast parts for wind turbines", "Ledger & Line"],
    ["Seed startup's drought-tolerant wheat clears field trials", "Commerce Daily"],
    ["Main street vacancy hits ten-year low as makers move in", "The Bottom Line"],
    ["Port debuts shore power, letting docked ships cut engines", "The Bottom Line"],
  ],
  technology: [
    ["Open-source mapping project charts its billionth footpath", "Circuit Weekly"],
    ["Repair-friendly laptop scores top marks in teardown review", "The Byteline"],
    ["Community mesh network survives storm that downed cell towers", "Circuit Weekly"],
    ["Museum restores room-sized computer to running condition", "The Byteline"],
    ["New battery chemistry promises decade-long smoke detectors", "Signal & Noise"],
    ["Volunteer coders digitize century of handwritten weather logs", "Signal & Noise"],
  ],
  science: [
    ["Backyard astronomers help confirm new comet's return date", "The Observatory"],
    ["Long-running soil study finds cover crops doubling earthworms", "Field & Formula"],
    ["Students' balloon experiment captures jet stream in 4K", "The Observatory"],
    ["Coral nursery reports best survival rate in program history", "Field & Formula"],
    ["Fossil found on school trip turns out to be new species", "The Specimen"],
    ["Dark-sky preserve certified after town swaps its streetlights", "The Specimen"],
  ],
  health: [
    ["Walking school buses cut tardiness and boost moods, study finds", "The Pulse"],
    ["Hospital garden program puts fresh produce on patient trays", "Wellness Wire"],
    ["Community pools add sensory-friendly swim hours", "The Pulse"],
    ["Researchers link lunchtime daylight to better sleep in teens", "Wellness Wire"],
    ["Free bike helmets fitted for two thousand kids at fair", "The Vital Sign"],
    ["Nurses' cookbook of one-pot dinners tops local bestseller list", "The Vital Sign"],
  ],
  sports: [
    ["Underdogs complete comeback season with title in extra time", "The Box Score"],
    ["City marathon adds sunrise wave to beat summer heat", "Sideline Report"],
    ["Little league fields reopen with lights donated by alumni", "The Box Score"],
    ["Climbing gym's youth team sweeps regional podium", "Sideline Report"],
    ["Rec league adds walking soccer division for grandparents", "The Nutmeg"],
    ["High school rivals merge bands for halftime tribute", "The Nutmeg"],
  ],
  entertainment: [
    ["Drive-in theater sells out revival month before opening night", "Marquee Weekly"],
    ["Local puppet troupe lands national tour after viral clip", "The Playbill Press"],
    ["Symphony's park series draws record picnic crowds", "Marquee Weekly"],
    ["Beloved bakery drama renewed for a fourth season", "The Playbill Press"],
    ["Museum's night-at-the-arcade exhibit extends its run", "Encore Daily"],
    ["Street piano map now covers every neighborhood", "Encore Daily"],
  ],
};

export function demoHeadlines(topic: string): HeadlinesResponse | null {
  const stub = STUBS[topic];
  if (!stub) return null;
  const now = Date.now();
  const items: Headline[] = stub.map(([title, source], i) => ({
    title,
    source,
    // Ages fan out like a real feed: 12m, 47m, 1.4h, 2.4h, ...
    publishedAt: new Date(now - (12 + i * 35 + i * i * 8) * 60000).toISOString(),
  }));
  return { headlines: { topic, fetchedAt: new Date(now).toISOString(), items } };
}

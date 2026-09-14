// Both modules are requested during the first Landing render. Keeping them in
// one lazy entry reduces transfer overhead without pulling in the deferred 3D story.
export { default as ExploreSpacesMenu } from "./ExploreSpacesMenu";
export { PitchSections } from "./PitchSections";

/** Points marqués sur une manche : « – » sans point, et part de la Power Stage en exposant. */
export function RallyPoints({ points, powerStage }: { points: number; powerStage: number }) {
  if (points <= 0) return <span className="pts-none">–</span>;
  return (
    <>
      {points}
      {powerStage > 0 && (
        <sup className="ps-mark" title={`Dont ${powerStage} point${powerStage > 1 ? "s" : ""} de Power Stage`}>
          +{powerStage}
        </sup>
      )}
    </>
  );
}

/** Légende de l'exposant : les points de Power Stage sont déjà comptés dans le total. */
export function PowerStageNote({ stage }: { stage?: string }) {
  return (
    <p className="ps-note">
      <span className="ps-mark">+N</span> : points de Power Stage{stage ? ` (${stage})` : ""}, déjà comptés dans le total.
    </p>
  );
}

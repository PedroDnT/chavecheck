export type PreparedLiveAudio = {player:HTMLAudioElement;context:AudioContext;stopPriming:()=>void};

/** Call synchronously from the camera button, before waiting for camera permission. */
export function prepareLiveAudio():PreparedLiveAudio {
  const context=new AudioContext();
  const player=new Audio();player.autoplay=true;player.setAttribute("playsinline","true");
  try {
    const destination=context.createMediaStreamDestination();
    const silence=context.createConstantSource();silence.offset.value=0;silence.connect(destination);silence.start();
    player.srcObject=destination.stream;
    // Both calls happen in the user's gesture. The same element/context play the later Live stream.
    void context.resume().catch(()=>undefined);void player.play().catch(()=>undefined);
    let priming=true;
    const stopPriming=()=>{if(!priming)return;priming=false;silence.stop();silence.disconnect();destination.stream.getTracks().forEach(track=>track.stop());};
    return {player,context,stopPriming};
  } catch(error) {
    player.pause();player.srcObject=null;void context.close().catch(()=>undefined);throw error;
  }
}

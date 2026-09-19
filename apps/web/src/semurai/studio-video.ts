/** Opaque-frame transport: source animations never receive access to the Studio origin. */
export const STUDIO_VIDEO_BRIDGE = `(function(){
  var root=document.querySelector('[data-composition-id="main"]');
  var timeline=window.__timelines && window.__timelines.main;
  if(!root || !timeline) { parent.postMessage({type:'semurai:video-error'},'*'); return; }
  var duration=Number(root.dataset.duration)||timeline.duration();
  var width=Number(root.dataset.width)||1080, height=Number(root.dataset.height)||1920;
  var stage=document.createElement('div'); stage.dataset.semuraiVideoStage='true';
  root.before(stage); stage.appendChild(root);
  Object.assign(stage.style,{position:'absolute',width:width+'px',height:height+'px',transformOrigin:'top left'});
  var css=document.createElement('style');css.textContent='html,body{width:100%!important;height:100%!important;margin:0!important;overflow:hidden!important}[data-semurai-video-hidden],[data-semurai-video-hidden] *{pointer-events:none!important}';document.head.appendChild(css);
  function fit(){var scale=Math.min(innerWidth/width,innerHeight/height);stage.style.transform='scale('+scale+')';stage.style.left=((innerWidth-width*scale)/2)+'px';stage.style.top=((innerHeight-height*scale)/2)+'px';}
  fit();addEventListener('resize',fit);
  var elements=Array.from(root.querySelectorAll('*'));
  function report(){elements.forEach(function(el){el.toggleAttribute('data-semurai-video-hidden',Number(getComputedStyle(el).opacity)<0.01);});parent.postMessage({type:'semurai:video-state',time:Math.min(duration,timeline.time()),duration:duration,playing:!timeline.paused()&&timeline.time()<duration},'*');}
  timeline.pause(0);report();
  addEventListener('message',function(event){if(event.source!==parent || event.data?.type!=='semurai:video')return;var data=event.data;
    if(typeof data.time==='number' && Number.isFinite(data.time))timeline.pause(Math.max(0,Math.min(duration,data.time)));
    if(data.play===true){if(timeline.time()>=duration)timeline.pause(0);timeline.play();}
    if(data.play===false)timeline.pause();report();
  });
  setInterval(report,100);
})();`;

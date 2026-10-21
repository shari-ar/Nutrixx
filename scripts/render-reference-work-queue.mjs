export function renderReferenceWorkQueueHtml() {
  return `<!doctype html>
<html lang="en-US"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nutrixx Reference Work Queue</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1421;color:#e7eff6}
body{max-width:1280px;margin:auto;padding:2rem}h1{font-size:clamp(2rem,4vw,3rem);margin:.4rem 0}h2{font-size:1.15rem}
p,small{color:#adbece;line-height:1.5}a{color:#7ddcc8}.eyebrow{color:#7ddcc8;text-transform:uppercase;letter-spacing:.15em;font-size:.8rem}
.notice,.panel{background:#152536;border:1px solid #2b4756;border-radius:16px;padding:1rem;margin:1.25rem 0}
.notice{border-left:4px solid #7ddcc8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem}
.stat strong{display:block;font-size:1.9rem}label{display:block;margin:1rem 0 .4rem}
input{box-sizing:border-box;width:100%;max-width:420px;padding:.8rem;border-radius:8px;border:1px solid #557184;background:#0b1421;color:inherit}
button{cursor:pointer;padding:.55rem .8rem;border:1px solid #557184;border-radius:8px;background:#1e3446;color:inherit}
button:hover,button:focus-visible{border-color:#7ddcc8}button:disabled{opacity:.5;cursor:default}
.layout{display:grid;grid-template-columns:minmax(300px,1fr) minmax(330px,1fr);gap:1rem;align-items:start}
.list{max-height:68vh;overflow:auto}.item{display:block;width:100%;margin:.35rem 0;text-align:left}.item[aria-pressed="true"]{border-color:#7ddcc8;background:#16352f}
.item small{display:block}code{overflow-wrap:anywhere;color:#c4e9df}ul{padding-left:1.3rem}li{margin:.25rem 0}
.pager{display:flex;align-items:center;gap:.7rem;margin:1rem 0}footer{margin:2rem 0;color:#9cbbca;font-size:.85rem}
@media(max-width:800px){.layout{grid-template-columns:1fr}.list{max-height:45vh}}
</style></head><body>
<p class="eyebrow">Internal / local reference operations</p><h1>Reference Work Queue</h1>
<p><a href="/">Data Quality Radar</a> · <a href="/queue.json">Machine-readable queue</a></p>
<div class="notice">This is a coverage review order, not a measured impact ranking. When consented, actual-consumption evidence is supplied, foods with more unique consumers appear first. Equal counts use missing baseline components, then total missing components. Without consumption evidence, the existing coverage order applies. Missing, explicitly unknown, and incompatible values stay distinct; observed zero remains known.</div>
<div class="panel"><h2>Stage local evidence</h2><p>Use a food ID and component ID from this queue in a reference proposal, then run <code>npm run reference:stage -- --source ./reference-workbench/source.pdf --proposal ./reference-workbench/proposal.json</code>. Proposed claims remain pending review and leave active data unchanged.</p></div>
<div class="grid">
<section class="panel stat"><small>Catalog foods</small><strong id="foods">—</strong></section>
<section class="panel stat"><small>Foods needing coverage review</small><strong id="candidates">—</strong></section>
<section class="panel stat"><small>Registered components</small><strong id="components">—</strong></section>
<section class="panel stat"><small>Consumption evidence</small><strong id="usage">—</strong></section>
</div>
<p id="release"></p>
<div class="panel"><h2>Other reference domains</h2><p>Cooking retention, cooking yield, and intake-reference work items await their own validated inventories. Their priority stays unmeasured until comparable replay evidence is available.</p></div>
<label for="filter">Find a food by name, food ID, or source record ID</label><input id="filter" type="search" autocomplete="off" placeholder="Search catalog foods">
<div class="layout"><section class="panel"><h2>Coverage candidates</h2><p id="count"></p><div class="list" id="list"></div><div class="pager"><button id="previous">Previous</button><span id="page"></span><button id="next">Next</button></div></section><section class="panel" id="details" aria-live="polite"><h2>Select a food</h2><p>Its exact missing component IDs and reasons will appear here.</p></section></div>
<footer>Local artifact audit only. Source records and queue stay in the development workspace.</footer>
<script type="module">
const queue=await fetch('/queue.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('The queue could not be opened.');return response.json()});
const byId=new Map(queue.components.map(component=>[component.componentId,component]));
const format=count=>count.toLocaleString('en-US');
document.querySelector('#foods').textContent=format(queue.totalFoods);
document.querySelector('#candidates').textContent=format(queue.candidateFoods);
document.querySelector('#components').textContent=format(queue.totalComponents);
document.querySelector('#usage').textContent=queue.consumptionEvidence.status==='aggregated-recorded-consumption'?'Supplied':'Not supplied';
document.querySelector('#release').textContent='Release '+queue.releaseId+' · Evaluated '+queue.evaluatedAt+' · Artifact SHA-256 '+queue.artifactSha256;
const list=document.querySelector('#list'),details=document.querySelector('#details'),filter=document.querySelector('#filter');
let matches=queue.items,page=0,selectedKey=null;const pageSize=50;
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node}
function componentSection(title,ids){const section=document.createElement('section');section.append(element('h3',title+' ('+format(ids.length)+')'));const values=document.createElement('ul');for(const id of ids){const component=byId.get(id);values.append(element('li',component?component.name+' · '+id:id))}section.append(values);return section}
function select(item){selectedKey=item.gapKey;details.replaceChildren(element('h2',item.foodName),element('p','Source record '+item.sourceRecordId+' · Food ID '+item.gap.subject.foodId),element('p',queue.consumptionEvidence.status==='aggregated-recorded-consumption'?format(item.uniqueConsumers)+' unique consumers recorded this food in the supplied period.':'Consumption evidence not supplied; coverage is the active review order.'),element('p',format(item.knownComponentCount)+' of '+format(item.totalComponentCount)+' components have comparable known values.'),element('p',format(item.missingBaselineComponentIds.length)+' missing components map to the adult baseline target set.'),element('p','Decision impact: unmeasured. Equal consumer counts: missing baseline components, then total gaps.'));details.append(componentSection('Absent observations',item.absentComponentIds),componentSection('Explicitly unknown',item.explicitlyUnknownComponentIds),componentSection('Unit or basis incompatible',item.unitIncompatibleComponentIds));render()}
function render(){list.replaceChildren();const start=page*pageSize;for(const item of matches.slice(start,start+pageSize)){const button=element('button',item.foodName);button.className='item';button.type='button';button.setAttribute('aria-pressed',String(item.gapKey===selectedKey));button.append(element('small',(queue.consumptionEvidence.status==='aggregated-recorded-consumption'?format(item.uniqueConsumers)+' unique consumers · ':'')+'Source '+item.sourceRecordId+' · '+format(item.missingBaselineComponentIds.length)+' baseline gaps · '+format(item.totalComponentCount-item.knownComponentCount)+' total gaps'));button.addEventListener('click',()=>select(item));list.append(button)}document.querySelector('#count').textContent=format(matches.length)+' matching candidates';document.querySelector('#page').textContent='Page '+format(page+1)+' of '+format(Math.max(1,Math.ceil(matches.length/pageSize)));document.querySelector('#previous').disabled=page===0;document.querySelector('#next').disabled=start+pageSize>=matches.length}
filter.addEventListener('input',()=>{const query=filter.value.trim().toLowerCase();matches=queue.items.filter(item=>item.foodName.toLowerCase().includes(query)||item.gap.subject.foodId.toLowerCase().includes(query)||item.sourceRecordId.toLowerCase().includes(query));page=0;render()});
document.querySelector('#previous').addEventListener('click',()=>{if(page>0){page--;render()}});
document.querySelector('#next').addEventListener('click',()=>{if((page+1)*pageSize<matches.length){page++;render()}});
render();
</script></body></html>`;
}

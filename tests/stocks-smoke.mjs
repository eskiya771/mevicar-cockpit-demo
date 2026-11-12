/* TradingView finance cockpit contract: free historical embeds, local watchlist, no HA dependency. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../stocks.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../stocks.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
new Function(js);
const store={};
const window={};
const document={getElementById:()=>null,querySelector:()=>null};
runInNewContext(js,{window,document,localStorage:{getItem:key=>store[key]||null,setItem:(key,value)=>store[key]=value},Intl,Date,Number,String,JSON,console});
const api=window.MeviStocks;
assert.equal(api.debug().mounted,false);
for(const ticker of ['XETR:SIE','NASDAQ:TSLA','NASDAQ:NVDA','NASDAQ:AAPL','TVC:DEU40'])
 assert.ok(api.debug().items.includes(ticker),'Default watchlist includes '+ticker);
assert.equal(api.validSymbol('NASDAQ:MSFT'),true);
assert.equal(api.resolveSymbol('SIE'),'XETR:SIE');
assert.equal(api.resolveSymbol('SIE.DE'),'XETR:SIE');
assert.equal(api.resolveSymbol('Siemens'),'XETR:SIE');
assert.equal(api.resolveSymbol('NVDA'),'NASDAQ:NVDA');
assert.equal(api.resolveSymbol('AAPL'),'NASDAQ:AAPL');
assert.equal(api.resolveSymbol('NASDAQ:MSFT'),'NASDAQ:MSFT');

for(const bad of ['', 'AAPL', '<script>', 'NASDAQ:AAPL?token=xxx','NASDAQ:AAPL&apikey=x'])assert.equal(api.validSymbol(bad),false);
assert.match(api.html(false),/Aktienkurse mit TradingView/);
assert.match(api.html(false),/Siemens/);
assert.match(api.html(false),/Tesla/);
assert.match(api.html(true),/is-compact/);
assert.doesNotMatch(js,/MeviHA|stockHistory|twelvedata|api\.twelvedata|fetch\(/i);
assert.doesNotMatch(api.html(false),/Simulierte Kurse|Kein gültiger Kurs/);
assert.match(js,/external-embedding\/embed-widget-advanced-chart\.js/);
let config=api.chartConfig('XETR:SIE','12M',false);
assert.equal(config.symbol,'XETR:SIE');
assert.equal(config.range,'12M');
assert.equal(config.autosize,true);
assert.equal(config.theme,'dark');
assert.equal(config.withdateranges,false);
assert.equal(api.chartConfig('NASDAQ:AAPL','1D',true).interval,'15');
assert.equal(api.chartConfig('NASDAQ:AAPL','1D',true).hide_top_toolbar,true);
assert.equal(config.hide_top_toolbar,true);
assert.equal(config.hide_volume,true);
assert.equal(config.hide_legend,true);
assert.match(api.html(false),/mevi-tv-sidebar/);
assert.match(api.html(false),/Manuell eingetragener Referenzkurs/);
assert.match(api.html(false),/281,70/);
assert.match(api.html(false),/Manuell/);
assert.match(api.html(false),/id="mevi-tv-periods"/);
assert.ok(api.html(false).indexOf('mevi-tv-periods')<api.html(false).indexOf('mevi-tv-list'),'Periods must be near watchlist');
assert.doesNotMatch(js,/tv-single-ticker\.js|embed-widget-symbol-info\.js/);
assert.match(css,/\.mevi-tv-manual-quote/);
assert.match(js,/function editQuote\(symbol\)/);
assert.doesNotMatch(api.html(false),/Historische Charts von TradingView|Charts und Kurse von TradingView/);
api.select('NASDAQ:NVDA');
assert.equal(api.debug().symbol,'NASDAQ:NVDA');
api.period('60M');
assert.equal(api.debug().period,'60M');
api.favorite('NASDAQ:NVDA');
assert.ok(api.debug().favorites.includes('NASDAQ:NVDA'));
api.favoritesOnly();
assert.doesNotMatch(api.html(false),/Siemens/);
api.favoritesOnly();
assert.match(api.html(false),/Siemens/);
// Mimic the form on an iPhone: entering just SIE must select Siemens
// even if it already exists and was previously filtered out.
const mockInputs={
 'mevi-tv-symbol':{value:'SIE'},
 'mevi-tv-name':{value:'Siemens'},
 'mevi-tv-add':{hidden:false},
 'mevi-tv-search':{value:'tes'},
 'mevi-tv-feedback':{textContent:''},
 'mevi-tv-list':{innerHTML:''},
 'mevi-tv-selected':{textContent:''},
 'mevi-tv-link':{href:''},
 'mevi-tv-chart':null,
 'mevi-tv-periods':null
};
const button={classList:{remove(){}},setAttribute(){}};
const formDocument={getElementById:key=>mockInputs[key]||null,querySelector:selector=>selector==='.mevi-tv-fav-filter'?button:null};
const formWindow={};
runInNewContext(js,{window:formWindow,document:formDocument,localStorage:{getItem:()=>null,setItem(){}},Intl,Date,Number,String,JSON,console});
const formAPI=formWindow.MeviStocks;
formAPI.select('NASDAQ:NVDA');
formAPI.search('tes');
formAPI.favoritesOnly();
formAPI.add();
assert.equal(formAPI.debug().symbol,'XETR:SIE','SIE must select existing Siemens');
assert.equal(mockInputs['mevi-tv-add'].hidden,true,'Add form must close');
assert.equal(mockInputs['mevi-tv-search'].value,'','Search field must clear');
assert.match(mockInputs['mevi-tv-list'].innerHTML,/Siemens/,'Siemens visible after add');
assert.equal(mockInputs['mevi-tv-feedback'].textContent,'Aktie bereits vorhanden – ausgewählt.');
// Adding SIE again after Siemens was removed must recreate the correct XETR ticker.
formAPI.remove('XETR:SIE');
mockInputs['mevi-tv-add'].hidden=false;
mockInputs['mevi-tv-symbol'].value='SIE';
formAPI.add();
assert.equal(formAPI.debug().symbol,'XETR:SIE');
assert.equal(formAPI.debug().items.filter(x=>x==='XETR:SIE').length,1);
api.remove('NASDAQ:TSLA');
assert.ok(!api.debug().items.includes('NASDAQ:TSLA'));
assert.ok(store['mevicar-stocks-tradingview-v1'],'Watchlist persisted');
const legacyStore={'mevicar-stocks-tradingview-v1':JSON.stringify({
 items:[{symbol:'INDEX:DEU40',name:'DAX'}],
 favorites:['INDEX:DEU40'],symbol:'INDEX:DEU40',period:'12M'
})};
const legacyWindow={};
runInNewContext(js,{window:legacyWindow,document,localStorage:{
 getItem:key=>legacyStore[key]||null,setItem:(key,value)=>legacyStore[key]=value
},Intl,Date,Number,String,JSON,console});
assert.ok(legacyWindow.MeviStocks.debug().items.includes('TVC:DEU40'),'Legacy DAX symbol migrated');
assert.equal(legacyWindow.MeviStocks.debug().symbol,'TVC:DEU40','Selected legacy DAX migrated');
assert.ok(legacyWindow.MeviStocks.debug().favorites.includes('TVC:DEU40'),'Legacy DAX favorite migrated');
assert.match(css,/\.mevi-tv\.is-compact/);
assert.match(css,/\.mevi-tv-chart/);
for(const token of ['window.MeviStocks?.html','window.MeviStocks.mount()','window.MeviStocks.unmount()','stocks-host','./stocks.js','./stocks.css'])assert.ok(html.includes(token),'Index integration: '+token);
assert.ok(workflow.includes('tests/stocks-smoke.mjs'));
assert.ok(workflow.includes('mevicar-stocks-script'));
assert.ok(workflow.includes('stocks.js stocks.css'));
assert.ok(sw.includes("'./stocks.js'")&&sw.includes("'./stocks.css'"));
console.log('TradingView Stocks: official widget, 5 watchlist defaults, favorites, periods, safe symbols, PWA integration passed.');

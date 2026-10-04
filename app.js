const PRODUCTS=[
{id:1,name:"SIGNAL HEAVY HOODIE",type:"HOODIE",category:"hoodies",price:89,size:["S","M","L","XL"],desc:"460 GSM Heavyweight Cotton, dropped shoulders und eine feste oversized Silhouette.",badge:"LIMITED",image:"assets/product-hoodie.svg"},
{id:2,name:"V/01 OVERSIZED TEE",type:"T-SHIRT",category:"tees",price:49,size:["S","M","L","XL"],desc:"Schwerer Jersey, weiter Body und cleanes V/01 Front-Branding.",badge:"NEW",image:"assets/product-tee.svg"},
{id:3,name:"NOISE ZIP HOODIE",type:"ZIP HOODIE",category:"hoodies",price:99,size:["S","M","L","XL"],desc:"Doppellagige Kapuze, Metall-Zip und tonales vertikales Branding.",badge:"DROP 001",image:"assets/product-zip.svg"},
{id:4,name:"UNREADABLE TEE",type:"T-SHIRT",category:"tees",price:54,size:["S","M","L","XL"],desc:"Boxy Fit mit großem Backprint und minimaler Frontsignatur.",badge:"BESTSELLER",image:"assets/product-unreadable.svg"},
{id:5,name:"VANTHEN CORE CAP",type:"CAP",category:"accessories",price:39,size:["OS"],desc:"Strukturierte Six-Panel Cap mit tonaler Stickerei und Metallverschluss.",badge:"CORE",image:"assets/product-cap.svg"},
{id:6,name:"SIGNAL BEANIE",type:"BEANIE",category:"accessories",price:34,size:["OS"],desc:"Schwerer Rippstrick mit gewebtem VANTHEN Label.",badge:"LIMITED",image:"assets/product-beanie.svg"}];

let cart=JSON.parse(localStorage.getItem("vanthen-cart")||"[]"),activeProduct=null,activeSize=null;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),money=n=>n.toLocaleString("de-DE",{style:"currency",currency:"EUR"});

function renderProducts(filter="all"){
 const grid=$("#productGrid");grid.innerHTML="";
 PRODUCTS.filter(p=>filter==="all"||p.category===filter).forEach(p=>{
   const el=document.createElement("article");el.className="product-card";
   el.innerHTML=`<div class="product-image"><img src="${p.image}" alt="${p.name}" loading="lazy"><span class="product-badge">${p.badge}</span><button class="quick-add">AUSWÄHLEN</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.type}</p><div class="color-dots"><i></i><i></i></div></div><strong>${money(p.price)}</strong></div>`;
   el.onclick=e=>{if(e.target.classList.contains("quick-add"))e.stopPropagation();openProduct(p)};grid.appendChild(el)
 })
}

function openProduct(p){
 activeProduct=p;activeSize=p.size[0];
 $("#modalType").textContent=p.type;$("#modalName").textContent=p.name;$("#modalPrice").textContent=money(p.price);$("#modalDescription").textContent=p.desc;$("#modalImage").src=p.image;$("#modalImage").alt=p.name;
 $("#modalSizes").innerHTML=p.size.map((s,i)=>`<button class="size ${i===0?"selected":""}" data-size="${s}">${s}</button>`).join("");
 $$("#modalSizes .size").forEach(b=>b.onclick=()=>{activeSize=b.dataset.size;$$("#modalSizes .size").forEach(x=>x.classList.remove("selected"));b.classList.add("selected")});
 $("#productModal").classList.add("show");$("#overlay").classList.add("show")
}

function closeAll(){$("#productModal").classList.remove("show");$("#cartDrawer").classList.remove("open");$("#overlay").classList.remove("show")}
function openCart(){$("#cartDrawer").classList.add("open");$("#overlay").classList.add("show")}
function addToCart(p,size){const found=cart.find(x=>x.id===p.id&&x.size===size);if(found)found.qty++;else cart.push({...p,size,qty:1});saveCart();closeAll();openCart()}
function saveCart(){localStorage.setItem("vanthen-cart",JSON.stringify(cart));renderCart()}

function renderCart(){
 const count=cart.reduce((a,b)=>a+b.qty,0),total=cart.reduce((a,b)=>a+b.price*b.qty,0);
 $("#cartCount").textContent=count;$("#cartTotal").textContent=money(total);$("#cartEmpty").style.display=cart.length?"none":"block";
 $("#cartItems").innerHTML=cart.map((x,i)=>`<div class="cart-item"><img src="${x.image}" alt="${x.name}"><div><h4>${x.name}</h4><p>GRÖSSE ${x.size} · ${money(x.price)}</p><div class="qty"><button onclick="changeQty(${i},-1)">−</button><span>${x.qty}</span><button onclick="changeQty(${i},1)">+</button></div></div><button class="remove" onclick="removeItem(${i})">ENTFERNEN</button></div>`).join("");
 const remain=Math.max(0,120-total);$("#shippingNote").textContent=remain===0?"KOSTENLOSER VERSAND FREIGESCHALTET.":`Noch ${money(remain)} bis kostenloser Versand.`;$("#progressBar").style.width=Math.min(100,total/120*100)+"%"
}

window.changeQty=(i,d)=>{cart[i].qty+=d;if(cart[i].qty<=0)cart.splice(i,1);saveCart()};window.removeItem=i=>{cart.splice(i,1);saveCart()};

$$(".filter").forEach(b=>b.onclick=()=>{$$(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");renderProducts(b.dataset.filter)});
$("#cartBtn").onclick=openCart;$("#closeCart").onclick=closeAll;$("#overlay").onclick=closeAll;$("#modalClose").onclick=closeAll;$("#modalAdd").onclick=()=>addToCart(activeProduct,activeSize);
$("#menuBtn").onclick=()=>$("#mobileMenu").style.display=$("#mobileMenu").style.display==="flex"?"none":"flex";
$("#searchBtn").onclick=()=>{$("#searchPanel").classList.add("open");setTimeout(()=>$("#searchInput").focus(),200)};$("#closeSearch").onclick=()=>$("#searchPanel").classList.remove("open");
$("#searchInput").oninput=e=>{const q=e.target.value.toLowerCase().trim();$("#searchResults").innerHTML=q?PRODUCTS.filter(p=>(p.name+" "+p.type).toLowerCase().includes(q)).map(p=>`<div class="search-result"><span>${p.name}</span><span>${money(p.price)}</span></div>`).join(""):""};
$("#newsletterForm").onsubmit=e=>{e.preventDefault();localStorage.setItem("vanthen-newsletter",$("#newsletterEmail").value);$("#newsletterMessage").textContent="DU BIST AUF DER PRIVATE-ACCESS-LISTE.";e.target.reset()};
$("#contactForm").onsubmit=e=>{e.preventDefault();const subject=encodeURIComponent("VANTHEN Anfrage"),body=encodeURIComponent(`Name: ${$("#contactName").value}\nE-Mail: ${$("#contactEmail").value}\n\n${$("#contactMessage").value}`);$("#contactStatus").textContent="Dein E-Mail-Programm wird geöffnet.";location.href=`mailto:contact@vanthen.de?subject=${subject}&body=${body}`};
$("#checkoutBtn").onclick=()=>{if(!cart.length){alert("Dein Warenkorb ist leer.");return}const total=cart.reduce((a,b)=>a+b.price*b.qty,0),summary=cart.map(x=>`${x.qty}x ${x.name} / ${x.size}`).join("%0A");location.href=`mailto:orders@vanthen.de?subject=VANTHEN%20Bestellanfrage&body=${summary}%0A%0ASumme:%20${encodeURIComponent(money(total))}`};
if(!localStorage.getItem("vanthen-cookie"))$("#cookieBanner").style.display="flex";$("#acceptCookies").onclick=()=>{localStorage.setItem("vanthen-cookie","1");$("#cookieBanner").style.display="none"};
renderProducts();renderCart();
const PRODUCTS=[
{id:1,name:"SCHRITT FÜR SCHRITT CREWNECK",type:"CREWNECK",category:"hoodies",price:89,size:["S","M","L","XL"],desc:"Premium Crewneck mit kleinem Frontlogo und Rückenprint „SCHRITT FÜR SCHRITT.“. Farben: Black, Navy, Wine Red, Gray und Beige.",badge:"NEW",image:"assets/products/crewneck-fixed.webp?v=restore-20261004-1"},
{id:2,name:"VERTRAU DEM WEG TEE",type:"T-SHIRT",category:"tees",price:49,size:["S","M","L","XL"],desc:"Cleanes VANTHEN T-Shirt mit Frontlogo und Rückenprint „VERTRAU DEM WEG.“. Erhältlich in Black, Navy Blue, Wine Red, Gray und Beige.",badge:"NEW",image:"assets/products/tee-vertrau.webp"},
{id:3,name:"ALLES HAT SEINE ZEIT TEE",type:"T-SHIRT",category:"tees",price:54,size:["S","M","L","XL"],desc:"VANTHEN T-Shirt mit dezenter Front und Statement-Rückenprint „ALLES HAT SEINE ZEIT.“. Farben: Black, Navy, Wine Red, Gray und Beige.",badge:"BESTSELLER",image:"assets/products/tee-zeit.webp"},
{id:4,name:"JEDER TAG ZÄHLT OVERSIZED TEE",type:"OVERSIZED T-SHIRT",category:"tees",price:59,size:["S","M","L","XL"],desc:"Boxy Oversized Fit mit dropped shoulders und großem Rückenprint „JEDER TAG ZÄHLT.“. In Black, Navy, Wine Red, Gray und Beige.",badge:"OVERSIZED",image:"assets/products/tee-oversized.webp"},
{id:5,name:"LEBE DEINEN WEG CAP",type:"CAP",category:"accessories",price:39,size:["OS"],desc:"VANTHEN Cap mit gesticktem Frontlogo und „LEBE DEINEN WEG.“ auf der Rückseite. Farben: Black, Navy, Wine Red, Gray und Beige.",badge:"CORE",image:"assets/products/cap-colors.webp?v=4"},
{id:6,name:"BLEIB ECHT BEANIE",type:"BEANIE",category:"accessories",price:34,size:["OS"],desc:"Gerippte Beanie mit VANTHEN Patch „BLEIB ECHT.“. Farben: Black, Navy, Wine Red, Gray und Beige.",badge:"LIMITED",image:"assets/products/beanie-fixed.webp?v=restore-20261004-1"}
];

let cart=JSON.parse(localStorage.getItem("vanthen-cart")||"[]"),activeProduct=null,activeSize=null;
const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),money=n=>n.toLocaleString("de-DE",{style:"currency",currency:"EUR"});

function renderProducts(filter="all"){
 const grid=$("#productGrid");grid.innerHTML="";
 PRODUCTS.filter(p=>filter==="all"||p.category===filter).forEach(p=>{
   const el=document.createElement("article");el.className="product-card";
   el.innerHTML=`<div class="product-image"><img src="${p.image}" alt="${p.name}" loading="lazy"><span class="product-badge">${p.badge}</span><button class="quick-add">AUSWÄHLEN</button></div><div class="product-info"><div><h3>${p.name}</h3><p>${p.type}</p><div class="color-dots"><i style="background:#111" title="Black"></i><i style="background:#14213d" title="Navy"></i><i style="background:#7b1e2b" title="Wine Red"></i><i style="background:#777" title="Gray"></i><i style="background:#d7c5aa" title="Beige"></i></div></div><strong>${money(p.price)}</strong></div>`;
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
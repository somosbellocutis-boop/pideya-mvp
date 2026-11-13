// Datos simulados (Conectados a la estructura que definimos con Supabase)
const restaurantesData = [
    { id: "REST-001", nombre: "La Casa de las Alitas", categoria: "Pollo", rating: 4.8, tiempo: "25-35 min", costo: "$3,500", img: "https://images.unsplash.com/photo-1527477396000-e27163b481c2" },
    { id: "REST-002", nombre: "Cervecería El Barril", categoria: "Bebidas", rating: 4.8, tiempo: "30 min", costo: "Gratis", img: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5" },
    { id: "REST-003", nombre: "Coctelería La Terraza", categoria: "Bebidas", rating: 4.7, tiempo: "20 min", costo: "$4,000", img: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b" }
];

const platosRestaurante = [
    { id: 1, nombre: "BIGOTE PEQ", desc: "Deliciosa pizza artesanal con extra queso mozzarella", precio: "$22,500", antiguo: "$36,000", img: "https://images.unsplash.com/photo-1513104890138-7c749659a591" },
    { id: 2, nombre: "BERLIN PEQ", desc: "Champiñones frescos y jugosos pepperoni", precio: "$19,900", antiguo: "$33,000", img: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38" },
    { id: 3, nombre: "ZIO PEQ", desc: "Especial de la casa con tomate y albahaca", precio: "$22,500", antiguo: "$42,000", img: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002" }
];

// Elementos del DOM
const gridContainer = document.getElementById("restaurantes-grid");
const platosContainer = document.getElementById("platos-container");
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const btnActionCenter = document.getElementById("btn-action-center");

// Renderizar Lobby Inicial (Restaurantes + Publicidad Intercalada)
function renderLobby() {
    gridContainer.innerHTML = "";
    
    restaurantesData.forEach((r, index) => {
        // Inyectar tarjeta de restaurante
        const card = document.createElement("div");
        card.className = "restaurant-card";
        card.innerHTML = `
            <img src="${r.img}" alt="${r.nombre}">
            <div class="card-body">
                <h4>${r.nombre}</h4>
                <p><i class="fa-solid fa-star" style="color:#f39c12"></i> ${r.rating} | ${r.tiempo}</p>
            </div>
        `;
        card.addEventListener("click", () => cambiarVista("view-restaurant"));
        gridContainer.appendChild(card);

        // Si es la posición 1, intercalar tarjeta publicitaria vertical (tipo Sándwich)
        if (index === 0) {
            const promoCard = document.createElement("div");
            promoCard.className = "promo-card vertical-promo";
            promoCard.innerHTML = `
                <div>
                    <span style="font-size: 10px; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px;">Promo Flash</span>
                    <h3>Sándwich</h3>
                    <p style="font-size: 13px;">$24.900</p>
                </div>
                <img src="https://images.unsplash.com/photo-1528735602780-2552fd46c7af" alt="Promo Sandwich">
                <button class="btn-promo-action">¡Pide aquí!</button>
            `;
            gridContainer.appendChild(promoCard);
        }
    });
}

// Renderizar Platos en Perfil de Tienda
function renderPlatos() {
    platosContainer.innerHTML = "";
    platosRestaurante.forEach(p => {
        const item = document.createElement("div");
        item.className = "menu-item-row";
        item.innerHTML = `
            <div class="menu-item-info">
                <h4>${p.nombre}</h4>
                <p>${p.desc}</p>
                <span>${p.precio} <del style="color:#999; font-size:10px;">${p.antiguo}</del></span>
            </div>
            <button class="add-item-btn"><i class="fa-solid fa-plus"></i></button>
        `;
        platosContainer.appendChild(item);
    });
}

// Control de Vistas
function cambiarVista(viewId) {
    views.forEach(v => v.classList.remove("active"));
    document.getElementById(viewId).classList.add("active");
}

// Eventos de Navegación Inferior
navItems.forEach(item => {
    item.addEventListener("click", () => {
        navItems.forEach(i => i.classList.remove("active"));
        item.classList.add("active");

        const target = item.getAttribute("data-target");
        if (target === "lobby") cambiarVista("view-lobby");
        if (target === "comercio") cambiarVista("view-comercio-login");
    });
});

// Botón Central flotante (Cambia según acción rápida)
btnActionCenter.addEventListener("click", () => {
    alert("Acción rápida: Registrar pedido o abrir carrito flotante");
});

document.getElementById("back-to-lobby").addEventListener("click", () => {
    cambiarVista("view-lobby");
});

// Inicializar Aplicación
window.addEventListener("DOMContentLoaded", () => {
    renderLobby();
    renderPlatos();
});

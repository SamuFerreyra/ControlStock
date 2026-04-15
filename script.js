// CONFIGURACIÓN
const URL_FIREBASE = "https://stockfamilia-6cefd-default-rtdb.firebaseio.com/productos.json";

let productos = [];
let rubroActual = "Gastronomía";
let productoSeleccionado = null;

// CARGAR DATOS AL INICIAR
async function cargarDatos() {
    try {
        const response = await fetch(URL_FIREBASE);
        const data = await response.json();
        // Firebase devuelve un objeto, lo convertimos a array
        productos = data ? Object.keys(data).map(key => ({...data[key], id: key})) : [];
        verificarReservasExpiradas();
        renderizarProductos();
    } catch (error) {
        console.error("Error cargando Firebase:", error);
    }
}

// GUARDAR DATOS EN LA NUBE
async function sincronizar() {
    await fetch(URL_FIREBASE, {
        method: 'PUT',
        body: JSON.stringify(productos)
    });
    renderizarProductos();
}

// Función para convertir imagen a texto (Base64)
function convertirImagenABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    cargarDatos();

    // Botón Agregar
    document.querySelector('.btn-add').addEventListener('click', () => {
        document.getElementById('modal-add').style.display = "block";
    });

    // Formulario Nuevo Producto (CON IMAGEN DE GALERÍA)
    document.getElementById('form-add-product').onsubmit = async (e) => {
        e.preventDefault();
        
        const fileInput = e.target.querySelector('input[type="file"]');
        let imagenBase64 = "";

        // Si seleccionaste una imagen, la convertimos antes de guardar
        if (fileInput && fileInput.files[0]) {
            imagenBase64 = await convertirImagenABase64(fileInput.files[0]);
        }

        const nuevo = {
            nombre: document.getElementById('add-name').value,
            precio: document.getElementById('add-price').value,
            stock: parseInt(document.getElementById('add-stock').value),
            rubro: document.getElementById('add-category').value,
            imagen: imagenBase64, // Aquí se guarda la foto como texto
            reservas: 0,
            fecha_reserva: null
        };

        productos.push(nuevo);
        await sincronizar();
        document.getElementById('modal-add').style.display = "none";
        e.target.reset();
    };

    // Cambio de rubros
    document.querySelectorAll('#category-list a').forEach(link => {
        link.onclick = (e) => {
            e.preventDefault();
            document.querySelectorAll('#category-list a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            rubroActual = link.getAttribute('data-category');
            document.querySelector('.top-bar h1 span').innerText = rubroActual;
            renderizarProductos();
        };
    });
});

function renderizarProductos() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = "";
    const filtrados = productos.filter(p => p.rubro === rubroActual);

    filtrados.forEach(p => {
        const card = document.createElement('div');
        card.className = `product-card ${p.stock === 0 ? 'out-of-stock' : ''}`;
        
        // Si hay imagen en Base64 la ponemos, sino un gris por defecto
        const styleImagen = p.imagen 
            ? `style="background-image: url('${p.imagen}'); background-size: cover; background-position: center;"` 
            : `style="background-color: #f3f4f6;"`;

        card.innerHTML = `
            <div class="product-image" ${styleImagen}>
                ${!p.imagen ? 'Sin Imagen' : ''}
            </div>
            <div class="product-info">
                <div class="product-header">
                    <h3>${p.nombre}</h3>
                    <span class="price-tag">$${p.precio}</span>
                </div>
                <p class="stock-label">Stock: <strong>${p.stock}</strong></p>
                ${p.reservas > 0 ? `<p class="reserve-label" style="color: #2563eb; font-size: 0.85rem;">Reservado: <strong>${p.reservas} un.</strong></p>` : ''}
                
                <div class="card-actions" style="margin-top: 15px;">
                    <button class="btn btn-reserve" onclick="prepararReserva('${p.nombre}')" ${p.stock === 0 ? 'disabled' : ''}>
                        ${p.stock === 0 ? 'Sin Stock' : 'Reservar'}
                    </button>
                    <button class="btn btn-delete" onclick="eliminarProducto('${p.nombre}')">Borrar</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// FUNCIONES GLOBALES
window.prepararReserva = (nombre) => {
    productoSeleccionado = productos.find(p => p.nombre === nombre);
    document.getElementById('reserve-product-name').innerText = nombre;
    document.getElementById('modal-reserve').style.display = "block";
};

window.confirmReserve = async () => {
    const qtyInput = document.getElementById('reserve-qty');
    const qty = parseInt(qtyInput.value);
    
    if (qty > 0 && qty <= productoSeleccionado.stock) {
        productoSeleccionado.stock -= qty;
        productoSeleccionado.reservas += qty;
        productoSeleccionado.fecha_reserva = new Date().getTime();
        await sincronizar();
        closeModal('modal-reserve');
        qtyInput.value = 1; // Reset cantidad
    } else {
        alert("Cantidad no válida o superior al stock disponible");
    }
};

window.closeModal = (id) => document.getElementById(id).style.display = "none";

window.eliminarProducto = async (nombre) => {
    if(confirm(`¿Estás seguro de eliminar "${nombre}"?`)) {
        productos = productos.filter(p => p.nombre !== nombre);
        await sincronizar();
    }
};

function verificarReservasExpiradas() {
    const ahora = new Date().getTime();
    let huboCambios = false;

    productos.forEach(p => {
        if (p.fecha_reserva && (ahora - p.fecha_reserva > 3 * 24 * 60 * 60 * 1000)) {
            p.stock += p.reservas;
            p.reservas = 0;
            p.fecha_reserva = null;
            huboCambios = true;
        }
    });

    if (huboCambios) sincronizar();
}
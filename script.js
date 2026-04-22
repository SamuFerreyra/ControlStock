// CONFIGURACIÓN
const URL_FIREBASE = "https://stockfamilia-6cefd-default-rtdb.firebaseio.com/productos.json";

let productos = [];
let rubroActual = "CocinaDePachu"; 
let productoSeleccionado = null;
let usuarioActual = localStorage.getItem('usuario_nombre') || null;

// --- SISTEMA DE USUARIO ---
function checkUser() {
    if (!usuarioActual) {
        document.getElementById('login-overlay').style.display = "block";
    }
}

function setUserName() {
    const name = document.getElementById('user-name-input').value.trim();
    if (name) {
        localStorage.setItem('usuario_nombre', name);
        usuarioActual = name;
        document.getElementById('login-overlay').style.display = "none";
    }
}

// --- CARGA Y SINCRONIZACIÓN ---
async function cargarDatos() {
    try {
        const response = await fetch(URL_FIREBASE);
        const data = await response.json();
        // Convertimos el objeto de Firebase en un array usando la KEY como ID
        productos = data ? Object.keys(data).map(key => {
            const p = data[key];
            return {...p, id: key, pedidos: p.pedidos || []};
        }) : [];
        verificarReservasExpiradas();
        renderizarProductos();
    } catch (error) {
        console.error("Error:", error);
    }
}

async function sincronizar() {
    // Usamos PUT para actualizar toda la lista de productos
    await fetch(URL_FIREBASE, {
        method: 'PUT',
        body: JSON.stringify(productos)
    });
    renderizarProductos();
}

// --- RENDERIZADO ---
function renderizarProductos() {
    const grid = document.getElementById('product-grid');
    grid.innerHTML = "";
    const filtrados = productos.filter(p => p.rubro === rubroActual);

    filtrados.forEach(p => {
        const totalReservado = (p.pedidos || []).reduce((sum, ped) => sum + ped.cantidad, 0);
        const card = document.createElement('div');
        card.className = `product-card ${p.stock === 0 ? 'out-of-stock' : ''}`;
        
        const styleImagen = p.imagen 
            ? `style="background-image: url('${p.imagen}'); background-size: cover; background-position: center;"` 
            : `style="background-color: #f3f4f6;"`;

        card.innerHTML = `
            <div class="product-image" ${styleImagen}>${!p.imagen ? 'Sin Imagen' : ''}</div>
            <div class="product-info">
                <div class="product-header">
                    <h3>${p.nombre}</h3>
                    <span class="price-tag">$${p.precio}</span>
                </div>
                <p class="stock-label">Stock Disponible: <strong>${p.stock}</strong></p>
                
                ${totalReservado > 0 ? 
                    `<p class="reserve-label" onclick="abrirGestionPedidos('${p.id}')" style="cursor:pointer; color: #2563eb; text-decoration: underline;">
                        Reservado: <strong>${totalReservado} un.</strong> (Ver detalles)
                    </p>` : ''}
                
                <div class="card-actions" style="margin-top: 15px;">
                    <button class="btn btn-reserve" onclick="prepararReserva('${p.id}')" ${p.stock === 0 ? 'disabled' : ''}>
                        ${p.stock === 0 ? 'Sin Stock' : 'Reservar'}
                    </button>
                    <button class="btn btn-delete" onclick="eliminarProducto('${p.id}')">Borrar</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- GESTIÓN DE RESERVAS ---
window.confirmReserve = async () => {
    const qtyInput = document.getElementById('reserve-qty');
    const qty = parseInt(qtyInput.value);
    
    if (qty > 0 && qty <= productoSeleccionado.stock) {
        productoSeleccionado.stock -= qty;
        
        const nuevoPedido = {
            usuario: usuarioActual,
            cantidad: qty,
            fecha: new Date().getTime()
        };
        
        if (!productoSeleccionado.pedidos) productoSeleccionado.pedidos = [];
        productoSeleccionado.pedidos.push(nuevoPedido);

        await sincronizar();
        closeModal('modal-reserve');
        qtyInput.value = 1;
    } else {
        alert("Cantidad no válida");
    }
};

window.abrirGestionPedidos = (id) => {
    productoSeleccionado = productos.find(p => p.id === id);
    document.getElementById('pedidos-product-name').innerText = productoSeleccionado.nombre;
    const lista = document.getElementById('lista-pedidos-detalle');
    lista.innerHTML = "";

    productoSeleccionado.pedidos.forEach((ped, index) => {
        const item = document.createElement('div');
        item.className = "pedido-item"; 
        item.innerHTML = `
            <div>
                <strong>${ped.usuario}</strong>: ${ped.cantidad} unidades
            </div>
            <div>
                <button class="btn" style="background:#22c55e; color:white; padding:5px 10px; margin-right:5px;" onclick="finalizarVenta(${index})">Vendido</button>
                <button class="btn" style="background:#ef4444; color:white; padding:5px 10px;" onclick="cancelarPedido(${index})">X</button>
            </div>
        `;
        lista.appendChild(item);
    });
    document.getElementById('modal-pedidos').style.display = "block";
};

window.finalizarVenta = async (index) => {
    productoSeleccionado.pedidos.splice(index, 1);
    await sincronizar();
    if (productoSeleccionado.pedidos.length === 0) closeModal('modal-pedidos');
    else abrirGestionPedidos(productoSeleccionado.id);
};

window.cancelarPedido = async (index) => {
    const pedido = productoSeleccionado.pedidos[index];
    productoSeleccionado.stock += pedido.cantidad;
    productoSeleccionado.pedidos.splice(index, 1);
    await sincronizar();
    if (productoSeleccionado.pedidos.length === 0) closeModal('modal-pedidos');
    else abrirGestionPedidos(productoSeleccionado.id);
};

// --- ELIMINAR PRODUCTO (CORREGIDO) ---
window.eliminarProducto = async (id) => {
    const p = productos.find(prod => prod.id === id);
    if(confirm(`¿Estás seguro de eliminar "${p.nombre}"?`)) {
        // Filtramos por ID para no borrar duplicados por error
        productos = productos.filter(prod => prod.id !== id);
        await sincronizar();
    }
};

// --- INICIO ---
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    cargarDatos();
    
    document.querySelector('.btn-add').addEventListener('click', () => {
        document.getElementById('modal-add').style.display = "block";
    });

    document.getElementById('form-add-product').onsubmit = async (e) => {
        e.preventDefault();
        const fileInput = e.target.querySelector('input[type="file"]');
        let imagenBase64 = "";
        if (fileInput && fileInput.files[0]) imagenBase64 = await convertirImagenABase64(fileInput.files[0]);

        productos.push({
            nombre: document.getElementById('add-name').value,
            precio: document.getElementById('add-price').value,
            stock: parseInt(document.getElementById('add-stock').value),
            rubro: document.getElementById('add-category').value,
            imagen: imagenBase64,
            pedidos: []
        });
        await sincronizar();
        closeModal('modal-add');
        e.target.reset();
    };

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

function verificarReservasExpiradas() {
    const ahora = new Date().getTime();
    let huboCambios = false;

    productos.forEach(p => {
        if (p.pedidos) {
            const pedidosValidos = p.pedidos.filter(ped => {
                if (ahora - ped.fecha > 3 * 24 * 60 * 60 * 1000) {
                    p.stock += ped.cantidad;
                    huboCambios = true;
                    return false;
                }
                return true;
            });
            p.pedidos = pedidosValidos;
        }
    });

    if (huboCambios) sincronizar();
}

window.prepararReserva = (id) => {
    productoSeleccionado = productos.find(p => p.id === id);
    document.getElementById('reserve-product-name').innerText = productoSeleccionado.nombre;
    document.getElementById('modal-reserve').style.display = "block";
};

window.closeModal = (id) => document.getElementById(id).style.display = "none";

function convertirImagenABase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}
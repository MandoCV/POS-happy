import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3, Check, ChevronDown, ChevronUp, ClipboardList, Clock3, CirclePlus, Download, Edit3, Flame,
  Wallet,
  Menu, Plus, Search, Trash2, Utensils, X,
} from 'lucide-react';
import './styles.css';

const statuses = {
  all: { label: 'Todas', color: 'neutral' },
  pending: { label: 'Pendientes', color: 'yellow' },
  preparing: { label: 'En preparación', color: 'orange' },
  ready: { label: 'Listas', color: 'green' },
  done: { label: 'Entregadas', color: 'blue' },
};
const categories = ['Comida', 'Bebidas', 'Alcohol', 'Postres'];
const paymentMethods = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' };

const defaultMenu = [
  { id: 1, name: 'Hamburguesa clásica', price: 145, category: 'Comida', available: true },
  { id: 2, name: 'Ensalada César', price: 120, category: 'Comida', available: true },
  { id: 3, name: 'Tacos al pastor', price: 95, category: 'Comida', available: true },
  { id: 4, name: 'Pizza grande', price: 240, category: 'Comida', available: true },
  { id: 5, name: 'Limonada', price: 45, category: 'Bebidas', available: true },
];

const defaultOrders = [
  { id: 1042, table: 'Mesa 8', customer: 'Familia García', products: [{ productId: 1, name: 'Hamburguesa clásica', price: 145, quantity: 2 }, { productId: 5, name: 'Limonada', price: 45, quantity: 2 }], time: '12:32', status: 'preparing', priority: true },
  { id: 1041, table: 'Para llevar', customer: 'Mariana López', products: [{ productId: 2, name: 'Ensalada César', price: 120, quantity: 1 }, { productId: 5, name: 'Limonada', price: 45, quantity: 1 }], time: '12:28', status: 'pending', priority: false },
  { id: 1040, table: 'Mesa 3', customer: 'Carlos Ramírez', products: [{ productId: 3, name: 'Tacos al pastor', price: 95, quantity: 3 }], time: '12:19', status: 'ready', priority: false },
];

const money = (value) => `$${value.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
const now = () => new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const formatDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase();
const totalOf = (products) => products.reduce((sum, item) => sum + item.price * item.quantity, 0);
const orderTotal = (order) => Number.isFinite(Number(order.customAmount)) ? Number(order.customAmount) : totalOf(order.products);
const productSummary = (products) => products.map((item) => `${item.quantity} ${item.name}`).join(', ');
const categoryFor = (item, menu) => menu.find((product) => product.id === item.productId)?.category || item.category || 'Comida';
const categoryClass = (category) => `category-${category.toLowerCase()}`;

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }

}

function Login({ onLogin }) {
  const [username, setUsername] = useState(() => readStorage('pos-happy-remembered-username', ''));
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(readStorage('pos-happy-remember-me', false)));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
      if (rememberMe) localStorage.setItem('pos-happy-remembered-username', username.trim());
      else localStorage.removeItem('pos-happy-remembered-username');
      localStorage.setItem('pos-happy-remember-me', JSON.stringify(rememberMe));
      onLogin(data.user);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell"><form className="login-card" onSubmit={submit}>
    <div className="brand login-brand"><span className="brand-mark">❤</span><span>pos<span className="brand-accent">happy</span></span></div>
    <p className="eyebrow">ACCESO LOCAL</p><h1>Bienvenido</h1><p className="login-subtitle">Ingresa con tu usuario para continuar.</p>
    <label>Usuario<input autoFocus value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
    <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    <label className="checkbox-label"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Recordarme en este dispositivo por 24 horas</label>
    {error && <p className="login-error" role="alert">{error}</p>}
    <button className="primary-button full" type="submit" disabled={loading}>{loading ? 'Ingresando…' : 'Iniciar sesión'}</button>
  </form></main>;
}

function App() {
  const [session, setSession] = useState(undefined);
  const [view, setView] = useState('orders');
  const [orders, setOrders] = useState(() => readStorage('pos-happy-orders', defaultOrders).map((order) => ({
    ...order,
    products: (order.products?.length ? order.products : order.items ? [{ productId: `legacy-${order.id}`, name: order.items, price: 0, quantity: 1 }] : []).map((item) => ({ ...item, delivered: item.delivered || 0 })),
  })));
  const [menu, setMenu] = useState(() => readStorage('pos-happy-menu', defaultMenu).map((item) => ({ ...item, category: item.category || 'Comida', available: item.available !== false })));
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [productEditor, setProductEditor] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [databaseLoaded, setDatabaseLoaded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [expenses, setExpenses] = useState(() => readStorage('pos-happy-expenses', []));

  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setSession(data?.user || null))
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const remaining = Math.max(session.expiresAt - Date.now(), 0);
    const timeout = setTimeout(() => {
      setSession(null);
      setDatabaseLoaded(false);
      setView('orders');
    }, remaining);
    return () => clearTimeout(timeout);
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;
    async function loadDatabase() {
      try {
        const response = await fetch('/api/state');
        if (!response.ok) throw new Error(`Database request failed: ${response.status}`);
        const state = await response.json();
        if (state.databaseExists) {
          const loadedMenu = state.menu.map((item) => ({ ...item, category: item.category || 'Comida', available: item.available !== false }));
          setMenu(loadedMenu);
          const legacyOrderDate = state.expenses.find((expense) => expense.date)?.date || today();
          setOrders(state.orders.map((order) => ({ ...order, date: order.date || legacyOrderDate, products: order.products.map((item) => ({ ...item, category: item.category || loadedMenu.find((product) => product.id === item.productId)?.category || 'Comida' })) })));
          setExpenses(Array.isArray(state.expenses) ? state.expenses : []);
        } else {
          await fetch('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ menu, orders, expenses }),
          });
        }
        setDatabaseLoaded(true);
      } catch (error) {
        console.error('No se pudo cargar la base de datos local compartida.', error);
      }
    }
    loadDatabase();
  }, [session]);

  useEffect(() => {
    if (!databaseLoaded || !session) return;
    localStorage.setItem('pos-happy-orders', JSON.stringify(orders));
    localStorage.setItem('pos-happy-menu', JSON.stringify(menu));
    localStorage.setItem('pos-happy-expenses', JSON.stringify(expenses));
    fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu, orders, expenses }),
    }).then((response) => {
      if (!response.ok) throw new Error(`Database save failed: ${response.status}`);
    }).catch((error) => console.error('No se pudo guardar la base de datos local compartida.', error));
  }, [orders, menu, expenses, databaseLoaded]);

  const permissions = session ? session.permissions : {};
  const can = (permission) => Boolean(permissions[permission]);

  useEffect(() => {
    if (session && !can(view)) setView('orders');
  }, [session, view]);

  const counts = useMemo(() => Object.fromEntries(Object.keys(statuses).map((key) => [
    key, key === 'all' ? orders.filter((order) => order.date === today()).length : orders.filter((order) => order.date === today() && order.status === key).length,
  ])), [orders]);
  const todayOrders = useMemo(() => orders.filter((order) => order.date === today()), [orders]);

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setSession(null);
    setDatabaseLoaded(false);
    setView('orders');
  }

  if (session === undefined) return <div className="auth-loading">Cargando sesión…</div>;
  if (!session) return <Login onLogin={setSession} />;

  function saveOrder(orderData) {
    if (!can('orders')) return;
    if (editor.mode === 'new') {
      setOrders((current) => [{ ...orderData, id: Math.max(...current.map((order) => order.id), 1000) + 1, date: today(), time: now(), status: 'pending' }, ...current]);
    } else {
      setOrders((current) => current.map((order) => order.id === orderData.id ? orderData : order));
    }
    setEditor(null);
  }

  function saveProduct(product) {
    if (!can('menu')) return;
    if (productEditor.mode === 'new') setMenu((current) => [...current, { ...product, id: Date.now(), available: true }]);
    else setMenu((current) => current.map((item) => item.id === product.id ? product : item));
    setProductEditor(null);
  }

  function cancelOrder() {
    if (!can('orders')) return;
    setOrders((current) => current.filter((order) => order.id !== orderToCancel.id));
    setOrderToCancel(null);
  }

  function changeOrderStatus(orderId, status) {
    if (!can('orders')) return;
    if (status === 'done') {
      setPaymentOrder(orders.find((order) => order.id === orderId) || null);
      return;
    }
    setOrders((current) => current.map((order) => order.id === orderId ? { ...order, status } : order));
  }

  function savePayment(method) {
    if (!can('orders')) return;
    setOrders((current) => current.map((order) => order.id === paymentOrder.id
      ? { ...order, status: 'done', paymentMethod: method }
      : order));
    setPaymentOrder(null);
  }

  function saveExpense(expense) {
    if (!can('expenses')) return;
    setExpenses((current) => [{ ...expense, id: Date.now(), date: today() }, ...current]);
  }

  function updateDelivered(orderId, productId, delivered) {
    if (!can('preparationEdit')) return;
    setOrders((current) => current.map((order) => {
      if (order.id !== orderId) return order;
      const products = order.products.map((item) => item.productId === productId
        ? { ...item, delivered: Math.min(Math.max(delivered, item.delivered || 0), item.quantity) }
        : item);
      const complete = products.length > 0 && products.every((item) => (item.delivered || 0) >= item.quantity);
      return { ...order, products, status: complete ? 'ready' : order.status };
    }));
  }

  function exportAccounts(format, selectedDate = today()) {
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `pos-happy-cuentas-${date}.${format === 'csv' ? 'csv' : 'json'}`;
    const dailyOrders = orders.filter((order) => order.date === selectedDate);
    const dailyExpenses = expenses.filter((expense) => expense.date === selectedDate);
    const totalRegistered = dailyOrders.reduce((sum, order) => sum + orderTotal(order), 0);
    const deliveredOrders = dailyOrders.filter((order) => order.status === 'done');
    const totalCollected = deliveredOrders.reduce((sum, order) => sum + orderTotal(order), 0);
    const averageTicket = dailyOrders.length ? totalRegistered / dailyOrders.length : 0;
    const totalExpenses = dailyExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const netProfit = totalCollected - totalExpenses;
    const categoryTotals = dailyOrders.flatMap((order) => order.products).reduce((summary, item) => {
      const category = categoryFor(item, menu);
      summary[category] = (summary[category] || 0) + item.price * item.quantity;
      return summary;
    }, {});
    const paymentTotals = deliveredOrders.reduce((summary, order) => {
      const method = paymentMethods[order.paymentMethod] || 'Sin registrar';
      summary[method] = (summary[method] || 0) + orderTotal(order);
      return summary;
    }, {});
    const content = format === 'csv'
      ? [
        'RESUMEN DEL DASHBOARD',
        'Métrica,Valor',
        `Fecha,"${date}"`,
        `Venta registrada,"${totalRegistered.toFixed(2)}"`,
        `Venta entregada,"${totalCollected.toFixed(2)}"`,
        `Cuentas del día,"${dailyOrders.length}"`,
        `Ticket promedio,"${averageTicket.toFixed(2)}"`,
        `Gastos,"${totalExpenses.toFixed(2)}"`,
        `Utilidad neta,"${netProfit.toFixed(2)}"`,
        '',
        'VENTA POR CATEGORÍA',
        'Categoría,Venta',
        ...categories.map((category) => `${category},"${(categoryTotals[category] || 0).toFixed(2)}"`),
        '',
        'VENTA POR MÉTODO DE PAGO',
        'Método,Venta',
        ...Object.entries(paymentTotals).map(([method, amount]) => `${method},"${amount.toFixed(2)}"`),
        '',
        'GASTOS',
        'Concepto,Monto,Fecha',
        ...dailyExpenses.map((expense) => `"${String(expense.concept || '').replaceAll('"', '""')}","${Number(expense.amount).toFixed(2)}",${expense.date || date}`),
        `TOTAL DE GASTOS,"${totalExpenses.toFixed(2)}",`,
        `UTILIDAD NETA,"${netProfit.toFixed(2)}",`,
        '',
        'Comanda,Hora,Mesa,Cliente,Estatus,Método de pago,Productos,Total',
        ...dailyOrders.map((order) => [
          order.id, order.time, order.table, order.customer, statuses[order.status].label, paymentMethods[order.paymentMethod] || 'Sin registrar',
          `"${productSummary(order.products).replaceAll('"', '""')}"`, orderTotal(order).toFixed(2),
        ].join(',')),
      ].join('\n')
      : JSON.stringify({
        fecha: date,
        resumen: {
          ventaRegistrada: totalRegistered,
          ventaEntregada: totalCollected,
          cuentasDelDia: orders.length,
          ticketPromedio: averageTicket,
          ventaPorCategoria: categoryTotals,
          ventaPorMetodoPago: paymentTotals,
          gastos: expenses,
          totalGastos: totalExpenses,
          utilidadNeta: netProfit,
        },
        cuentas: orders,
      }, null, 2);
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">❤</span><span>pos<span className="brand-accent">happy</span></span></div>
      <div className="workspace-label">OPERACIÓN</div>
      <nav>
        {can('orders') && <button className={`nav-item ${view === 'orders' ? 'active' : ''}`} onClick={() => { setView('orders'); setMobileMenuOpen(false); }}><ClipboardList size={19} /> Comandas <span className="nav-count">{counts.pending + counts.preparing}</span></button>}
        {can('preparation') && <button className={`nav-item ${view === 'preparation' ? 'active' : ''}`} onClick={() => { setView('preparation'); setMobileMenuOpen(false); }}><Flame size={19} /> Preparación <span className="nav-count">{todayOrders.filter((order) => order.status === 'preparing').length}</span></button>}
        {can('menu') && <button className={`nav-item ${view === 'menu' ? 'active' : ''}`} onClick={() => { setView('menu'); setMobileMenuOpen(false); }}><Utensils size={19} /> Menú</button>}
        {can('sales') && <button className={`nav-item ${view === 'sales' ? 'active' : ''}`} onClick={() => { setView('sales'); setMobileMenuOpen(false); }}><BarChart3 size={19} /> Ventas</button>}
        {can('expenses') && <button className={`nav-item ${view === 'expenses' ? 'active' : ''}`} onClick={() => { setView('expenses'); setMobileMenuOpen(false); }}><Wallet size={19} /> Gastos</button>}
      </nav>
      <div className="sidebar-bottom"><div className="user-avatar">{session.username.slice(0, 2).toUpperCase()}</div><div><strong>{session.name}</strong><small>{session.role}</small></div><button className="logout-button" onClick={logout}>Salir</button></div>
    </aside>

    <button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menú"><Menu size={21} /></button>
    {mobileMenuOpen && <button className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú" />}
    <aside className={`mobile-drawer ${mobileMenuOpen ? 'open' : ''}`}>
      <div className="mobile-drawer-header"><div className="brand"><span className="brand-mark">❤</span><span>pos<span className="brand-accent">happy</span></span></div><button className="icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menú"><X size={20} /></button></div>
      <div className="workspace-label">OPERACIÓN</div>
      <nav>
        {can('orders') && <button className={`nav-item ${view === 'orders' ? 'active' : ''}`} onClick={() => { setView('orders'); setMobileMenuOpen(false); }}><ClipboardList size={19} /> Comandas <span className="nav-count">{counts.pending + counts.preparing}</span></button>}
        {can('preparation') && <button className={`nav-item ${view === 'preparation' ? 'active' : ''}`} onClick={() => { setView('preparation'); setMobileMenuOpen(false); }}><Flame size={19} /> Preparación <span className="nav-count">{todayOrders.filter((order) => order.status === 'preparing').length}</span></button>}
        {can('menu') && <button className={`nav-item ${view === 'menu' ? 'active' : ''}`} onClick={() => { setView('menu'); setMobileMenuOpen(false); }}><Utensils size={19} /> Menú</button>}
        {can('sales') && <button className={`nav-item ${view === 'sales' ? 'active' : ''}`} onClick={() => { setView('sales'); setMobileMenuOpen(false); }}><BarChart3 size={19} /> Ventas</button>}
        {can('expenses') && <button className={`nav-item ${view === 'expenses' ? 'active' : ''}`} onClick={() => { setView('expenses'); setMobileMenuOpen(false); }}><Wallet size={19} /> Gastos</button>}
      </nav>
      <button className="logout-button mobile-logout" onClick={logout}>Cerrar sesión</button>
    </aside>
    <main className="main-content">
      {view === 'orders' ? <OrdersView
        orders={orders} counts={counts} filter={filter} setFilter={setFilter} search={search} setSearch={setSearch}
        menu={menu} expenses={expenses} onNew={() => setEditor({ mode: 'new' })} onEdit={(order) => setEditor({ mode: 'edit', order })}
        onAdd={(order) => setEditor({ mode: 'add', order })} onStatus={changeOrderStatus}
        onCancel={setOrderToCancel}
        onDetail={setOrderDetail}
      /> : view === 'preparation' ? <PreparationView orders={todayOrders} onDetail={setOrderDetail} onDelivered={updateDelivered} canEdit={can('preparationEdit')} /> : view === 'sales' ? <SalesView orders={orders} menu={menu} expenses={expenses} onExport={exportAccounts} /> : view === 'expenses' ? <ExpensesView expenses={expenses} onSave={saveExpense} onDelete={(id) => can('expenses') && setExpenses((current) => current.filter((expense) => expense.id !== id))} /> : <MenuView menu={menu} onNew={() => setProductEditor({ mode: 'new' })} onEdit={(product) => setProductEditor({ mode: 'edit', product })} onToggle={(product) => setMenu((current) => current.map((item) => item.id === product.id ? { ...item, available: item.available === false } : item))} onDelete={(product) => setMenu((current) => current.filter((item) => item.id !== product.id))} />}
    </main>

    {editor && <OrderEditor editor={editor} menu={menu} onClose={() => setEditor(null)} onSave={saveOrder} />}
    {productEditor && <ProductEditor editor={productEditor} onClose={() => setProductEditor(null)} onSave={saveProduct} />}
    {orderDetail && <OrderDetail order={orderDetail} onClose={() => setOrderDetail(null)} />}
    {paymentOrder && <PaymentMethodModal order={paymentOrder} onClose={() => setPaymentOrder(null)} onSave={savePayment} />}
    {orderToCancel && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOrderToCancel(null)}>
      <div className="modal confirmation-modal"><div className="confirmation-icon"><Trash2 size={21} /></div><h2>¿Eliminar comanda #{orderToCancel.id}?</h2><p>La comanda se eliminará de la lista. Esta acción no se puede deshacer.</p><div className="confirmation-actions"><button className="secondary-button" onClick={() => setOrderToCancel(null)}>Conservar</button><button className="danger-button" onClick={cancelOrder}>Sí, eliminar</button></div></div>
    </div>}
  </div>;
}

function OrdersView({ orders, counts, filter, setFilter, search, setSearch, menu, expenses, onNew, onEdit, onAdd, onStatus, onCancel, onDetail }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const selectedOrders = orders.filter((order) => order.date === selectedDate);
  const selectedExpenses = expenses.filter((expense) => expense.date === selectedDate);
  const selectedCounts = Object.fromEntries(Object.keys(statuses).map((key) => [
    key, key === 'all' ? selectedOrders.length : selectedOrders.filter((order) => order.status === key).length,
  ]));
  return <>
    <header className="topbar"><div><p className="eyebrow">{formatDate(selectedDate)}</p><h1>Comandas</h1></div><div className="date-filter"><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><button className="primary-button" onClick={onNew}><CirclePlus size={18} /> Nueva comanda</button></div></header>
    <section className="summary-grid"><SummaryCard icon={<ClipboardList />} label="Total del día" value={selectedCounts.all} tone="purple" /><SummaryCard icon={<Clock3 />} label="Por preparar" value={selectedCounts.pending + selectedCounts.preparing} tone="orange" /><SummaryCard icon={<Check />} label="Listas para entregar" value={selectedCounts.ready} tone="green" /><SummaryCard icon={<Wallet />} label="Gastos" value={money(selectedExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0))} tone="red" /></section>
    <section className="orders-panel"><div className="panel-toolbar"><div className="tabs">{Object.entries(statuses).map(([key, status]) => <button key={key} className={filter === key ? 'tab active' : 'tab'} onClick={() => setFilter(key)}>{status.label}<span className="tab-count">{selectedCounts[key]}</span></button>)}</div><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar comanda..." /></label></div><div className="orders-list">{selectedOrders.filter((order) => (filter === 'all' || order.status === filter) && (!search || `${order.id} ${order.table} ${order.customer} ${productSummary(order.products)}`.toLowerCase().includes(search.toLowerCase()))).map((order) => <OrderCard key={order.id} order={order} menu={menu} onStatus={onStatus} onEdit={onEdit} onAdd={onAdd} onCancel={onCancel} onDetail={onDetail} />)}{!selectedOrders.length && <div className="empty-state"><ClipboardList size={38} /><strong>No hay comandas para esta fecha</strong><span>Agrega una nueva comanda para comenzar.</span></div>}</div></section>
  </>;
}

function OrderCard({ order, onStatus, onEdit, onAdd, onCancel, onDetail }) {
  return <article className={`order-card ${order.priority ? 'high-priority' : ''}`}>
    <div className="order-number"><span>#{order.id}</span>{order.priority && <span className="priority"><Flame size={13} /> Prioridad</span>}</div>
    <div className="order-main"><div className="order-heading"><strong>{order.table}</strong><span className={`status-pill ${statuses[order.status].color}`}>{statuses[order.status].label}</span></div><p className="customer">{order.customer}</p><p className="items">{productSummary(order.products)}</p><strong className="order-total">{money(orderTotal(order))}</strong></div>
    <div className="order-time"><Clock3 size={14} /> {order.time}</div>
    <div className="order-actions"><select className="status-select" value={order.status} onChange={(event) => onStatus(order.id, event.target.value)} aria-label={`Estado de comanda ${order.id}`}>{Object.entries(statuses).filter(([key]) => key !== 'all').map(([key, status]) => <option key={key} value={key}>{status.label}</option>)}</select><button className="small-action" onClick={() => onDetail(order)} title="Ver detalles"><ClipboardList size={15} /> Detalles</button><button className="small-action" onClick={() => onAdd(order)} title="Añadir productos"><Plus size={15} /> Añadir</button><button className="small-action" onClick={() => onEdit(order)} title="Editar comanda"><Edit3 size={15} /></button><button className="cancel-action" onClick={() => onCancel(order)} aria-label={`Eliminar comanda ${order.id}`} title="Eliminar comanda"><Trash2 size={16} /></button></div>
  </article>;
}

function OrderDetail({ order, onClose }) {
  const deliveredCount = order.products.reduce((sum, item) => sum + (item.delivered || 0), 0);
  const totalCount = order.products.reduce((sum, item) => sum + item.quantity, 0);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal detail-modal" role="dialog" aria-modal="true">
      <div className="modal-header"><div><p className="eyebrow">RESUMEN DE COMANDA</p><h2>#{order.id} · {order.table}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
      <div className="detail-meta"><span>{order.customer}</span><span className={`status-pill ${statuses[order.status].color}`}>{statuses[order.status].label}</span></div>
      <div className="detail-products">{order.products.map((item) => {
        const delivered = item.delivered || 0;
        return <div className={`detail-product ${delivered === item.quantity ? 'delivered' : ''}`} key={item.productId}>
          <div><strong>{item.name}</strong><span>{delivered} de {item.quantity} entregados</span></div>
          <div className="detail-product-actions"><strong>{money(item.price * item.quantity)}</strong><span className={`detail-status ${delivered === item.quantity ? 'complete' : ''}`}>{delivered === item.quantity ? 'Listo' : `${delivered}/${item.quantity}`}</span></div>
        </div>;
      })}</div>
      <div className="detail-footer"><span>Progreso: <strong>{deliveredCount}/{totalCount} productos</strong></span><strong>{money(orderTotal(order))}</strong></div>
    </div>
  </div>;
}

function PaymentMethodModal({ order, onClose, onSave }) {
  const [method, setMethod] = useState('cash');
  return <div className="modal-backdrop"><div className="modal payment-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><p className="eyebrow">COBRO DE COMANDA</p><h2>Registrar pago</h2></div><button className="icon-button" onClick={onClose} aria-label="Cancelar"><X size={19} /></button></div><p className="payment-question">¿Cómo se pagó la comanda #{order.id} por <strong>{money(orderTotal(order))}</strong>?</p><div className="payment-options">{Object.entries(paymentMethods).map(([key, label]) => <button key={key} type="button" className={`payment-option ${method === key ? 'selected' : ''}`} onClick={() => setMethod(key)}>{label}</button>)}</div><div className="confirmation-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button full" onClick={() => onSave(method)}>Marcar entregada</button></div></div></div>;
}

function PreparationView({ orders, onDetail, onDelivered, canEdit }) {
  const [showQueueModal, setShowQueueModal] = useState(false);
  const activeOrders = orders.filter((order) => order.status === 'preparing');
  const pendingItems = activeOrders.flatMap((order) => order.products.flatMap((item) => Array.from({ length: Math.max(item.quantity - (item.delivered || 0), 0) }, () => ({ ...item, orderId: order.id, table: order.table }))));
  return <><header className="topbar"><div><p className="eyebrow">COCINA · PRODUCCIÓN</p><h1>Preparación</h1>{!canEdit && <p className="read-only-note">Vista de solo lectura</p>}</div><div className="prep-header-actions"><div className="prep-counter"><Flame size={18} /> {pendingItems.length} productos pendientes</div><button className="primary-button queue-open-button" onClick={() => setShowQueueModal(true)}><Flame size={17} /> Ver cola grande</button></div></header><section className="prep-layout"><div className="prep-summary"><div className="prep-summary-title"><Flame size={19} /> Comandas en preparación <strong>{activeOrders.length}</strong></div>{activeOrders.length ? activeOrders.map((order) => <article className="prep-order" key={order.id}><div className="prep-order-header"><div><strong>#{order.id} · {order.table}</strong><span>{order.customer}</span></div><button className="small-action" onClick={() => onDetail(order)}>Ver detalle</button></div><div className="prep-products">{order.products.map((item) => { const delivered = item.delivered || 0; const pending = Math.max(item.quantity - delivered, 0); return <div className={`prep-product ${pending === 0 ? 'done' : ''}`} key={item.productId}><span>{item.name} <small>{delivered}/{item.quantity}</small></span><strong>{pending ? `${pending} por preparar` : 'Listo'}</strong>{canEdit && <button className="prep-check" disabled={pending === 0} onClick={() => onDelivered(order.id, item.productId, delivered + 1)}><Check size={15} /></button>}</div>; })}</div></article>) : <div className="empty-state"><Utensils size={38} /><strong>Cocina al día</strong><span>No hay comandas en preparación.</span></div>}</div><div className="prep-queue"><p className="eyebrow">COLA DE COCINA</p><h3>Lo que falta preparar</h3>{pendingItems.length ? pendingItems.map((item, index) => <div className="queue-item" key={`${item.orderId}-${item.productId}-${index}`}><span className="queue-quantity">1</span><div><strong>{item.name}</strong><small>Comanda #{item.orderId} · {item.table}</small></div></div>) : <p className="queue-empty">Todo está listo por ahora.</p>}</div></section>{showQueueModal && <KitchenQueueModal orders={activeOrders} pendingItems={pendingItems} onClose={() => setShowQueueModal(false)} onDelivered={onDelivered} canEdit={canEdit} />}</>;
}

function KitchenQueueModal({ orders, pendingItems, onClose, onDelivered, canEdit }) {
  return <div className="modal-backdrop kitchen-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="kitchen-modal" role="dialog" aria-modal="true" aria-labelledby="kitchen-queue-title">
      <div className="kitchen-modal-header"><div><p className="kitchen-eyebrow">VISTA DE COCINA</p><h2 id="kitchen-queue-title">Cola de preparación</h2><strong>{pendingItems.length} productos pendientes</strong></div><button className="kitchen-close" onClick={onClose} aria-label="Cerrar cola"><X size={28} /></button></div>
      <div className="kitchen-orders">{orders.length ? orders.map((order) => <section className="kitchen-order" key={order.id}><div className="kitchen-order-title"><strong>#{order.id} · {order.table}</strong><span>{order.customer}</span></div><div className="kitchen-products">{order.products.map((item) => { const delivered = item.delivered || 0; const pending = Math.max(item.quantity - (item.delivered || 0), 0); return <div className={`kitchen-product ${pending === 0 ? 'done' : ''}`} key={item.productId}><div className="kitchen-product-name"><strong>{item.name}</strong><span>{delivered} de {item.quantity} preparados</span></div>{canEdit && <button className="kitchen-check" disabled={pending === 0} onClick={() => onDelivered(order.id, item.productId, delivered + 1)} aria-label={`Marcar una unidad de ${item.name}`}>{pending === 0 ? <Check size={26} /> : <span>✓</span>}</button>}</div>; })}</div></section>) : <div className="kitchen-empty">No hay productos pendientes.</div>}</div>
      <button className="kitchen-finish" onClick={onClose}>Cerrar cola</button>
    </div>
  </div>;
}

function OrderEditor({ editor, menu, onClose, onSave }) {
  const existing = editor.order;
  const availableMenu = menu.filter((item) => item.available !== false);
  const [table, setTable] = useState(existing?.table || '');
  const [customer, setCustomer] = useState(existing?.customer || '');
  const [priority, setPriority] = useState(existing?.priority || false);
  const [products, setProducts] = useState(editor.mode === 'edit' ? (existing?.products || []) : []);
  const [selected, setSelected] = useState(availableMenu[0]?.id || menu[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState(existing?.customAmount ?? '');

  function addProduct() {
    const product = availableMenu.find((item) => item.id === Number(selected));
    if (!product) return;
    setProducts((current) => {
      const found = current.find((item) => item.productId === product.id);
      return found ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + Number(quantity) } : item) : [...current, { productId: product.id, name: product.name, price: product.price, category: product.category, quantity: Number(quantity) }];
    });
    setQuantity(1);
  }

  function submit(event) {
    event.preventDefault();
    if (!products.length && editor.mode === 'new') return;
    const merged = editor.mode === 'add' ? [...existing.products, ...products] : products;
    const parsedCustomAmount = customAmount === '' ? null : Number(customAmount);
    if (parsedCustomAmount !== null && (!Number.isFinite(parsedCustomAmount) || parsedCustomAmount < 0)) return;
    const amountData = parsedCustomAmount === null
      ? (editor.mode === 'add' && existing.customAmount !== undefined ? { customAmount: existing.customAmount } : editor.mode === 'edit' ? { customAmount: undefined } : {})
      : { customAmount: parsedCustomAmount };
    const order = editor.mode === 'new'
      ? { table, customer: customer || 'Cliente sin nombre', products: merged, priority, ...amountData }
      : { ...existing, table, customer: customer || 'Cliente sin nombre', products: merged, priority, ...amountData, ...(editor.mode === 'add' ? { status: 'preparing' } : {}) };
    onSave(order);
  }

  const calculatedTotal = totalOf([...(editor.mode === 'add' ? existing.products : []), ...products]);
  return <div className="modal-backdrop"><form className="modal order-editor" onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">{editor.mode === 'add' ? 'AÑADIR CONSUMO' : 'COMANDA'}</p><h2>{editor.mode === 'new' ? 'Nueva comanda' : editor.mode === 'add' ? `Añadir a #${existing.id}` : `Editar #${existing.id}`}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><label>Mesa o tipo de pedido<input value={table} onChange={(event) => setTable(event.target.value)} required /></label><label>Cliente<input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Nombre del cliente" /></label><div className="product-add-row"><select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={!menu.length}>{menu.map((product) => <option key={product.id} value={product.id} disabled={product.available === false}>{product.name} · {money(product.price)}{product.available === false ? ' · Agotado' : ''}</option>)}</select><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /><button type="button" className="secondary-button add-product" onClick={addProduct} disabled={!availableMenu.length}><Plus size={15} /> Agregar</button></div>{!availableMenu.length && <p className="availability-note">No hay productos disponibles en el menú.</p>}<div className="selected-products">{editor.mode === 'add' && existing.products.map((item) => <ProductLine key={`old-${item.productId}`} item={item} readOnly />)}{products.map((item) => <ProductLine key={item.productId} item={item} onRemove={() => setProducts((current) => current.filter((product) => product.productId !== item.productId))} />)}</div><label>Monto personalizado (opcional)<input type="number" min="0" step="0.01" value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} placeholder={`Calculado: ${money(calculatedTotal)}`} /></label><label className="checkbox-label"><input type="checkbox" checked={priority} onChange={(event) => setPriority(event.target.checked)} /> Marcar como prioridad alta</label><div className="editor-total">Total: <strong>{money(customAmount === '' ? calculatedTotal : Number(customAmount))}</strong></div><button className="primary-button full" type="submit">{editor.mode === 'add' ? 'Añadir a la comanda' : 'Guardar comanda'}</button></form></div>;
}

function ProductLine({ item, onRemove, readOnly }) { return <div className="product-line"><span>{item.quantity} × {item.name}</span><strong>{money(item.price * item.quantity)}</strong>{!readOnly && <button type="button" onClick={onRemove}><X size={14} /></button>}</div>; }

function ProductEditor({ editor, onClose, onSave }) {
  const [name, setName] = useState(editor.product?.name || '');
  const [price, setPrice] = useState(editor.product?.price || '');
  const [category, setCategory] = useState(editor.product?.category || 'Comida');
  function submit(event) { event.preventDefault(); onSave({ ...editor.product, name, price: Number(price), category }); }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-header"><div><p className="eyebrow">CATÁLOGO</p><h2>{editor.mode === 'new' ? 'Nuevo producto' : 'Editar producto'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></div><label>Nombre del producto<input value={name} onChange={(event) => setName(event.target.value)} required placeholder="Ej. Café americano" /></label><label>Precio<input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required placeholder="0.00" /></label><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><button className="primary-button full" type="submit">Guardar producto</button></form></div>;
}

function MenuView({ menu, onNew, onEdit, onToggle, onDelete }) {
  return <><header className="topbar"><div><p className="eyebrow">CATÁLOGO DE PRODUCTOS</p><h1>Menú</h1></div><button className="primary-button" onClick={onNew}><CirclePlus size={18} /> Nuevo producto</button></header><section className="menu-panel"><div className="menu-intro"><Utensils size={22} /><div><strong>Productos disponibles</strong><span>Los productos desactivados no aparecerán al crear comandas.</span></div></div><div className="menu-grid">{menu.map((product) => <article className={`menu-item ${product.available === false ? 'product-unavailable' : ''}`} key={product.id}><div><strong>{product.name}</strong><span>{money(product.price)} <em className={`category-tag ${categoryClass(product.category || 'Comida')}`}>{product.category || 'Comida'}</em><em className={`availability-label ${product.available === false ? 'unavailable' : ''}`}>{product.available === false ? 'Agotado' : 'Disponible'}</em></span></div><div className="menu-actions"><button className="small-action" onClick={() => onToggle(product)}>{product.available === false ? 'Activar' : 'Desactivar'}</button><button className="small-action" onClick={() => onEdit(product)}><Edit3 size={15} /> Editar</button><button className="cancel-action" onClick={() => onDelete(product)} aria-label={`Eliminar ${product.name}`}><Trash2 size={16} /></button></div></article>)}</div></section></>;
}

function ExpensesView({ expenses, onSave, onDelete }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const visibleExpenses = expenses.filter((expense) => expense.date === selectedDate);
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  function submit(event) {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!concept.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    onSave({ concept: concept.trim(), amount: parsedAmount });
    setConcept('');
    setAmount('');
  }
  const totalExpenses = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return <><header className="topbar"><div><p className="eyebrow">CONTROL DE EGRESOS</p><h1>Gastos</h1></div><div className="date-filter"><label>Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><div className="expense-total">Total: <strong>{money(totalExpenses)}</strong></div></div></header><section className="expense-layout"><form className="expense-form" onSubmit={submit}><h2>Registrar gasto</h2><label>Concepto<input value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="Ej. Compra de insumos" required /></label><label>Total del gasto<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label><button className="primary-button full" type="submit"><Plus size={16} /> Agregar gasto</button></form><section className="expenses-panel"><div className="expense-list-header"><h2>Gastos registrados</h2><span>{visibleExpenses.length} movimientos</span></div>{visibleExpenses.length ? visibleExpenses.map((expense) => <div className="expense-row" key={expense.id}><div><strong>{expense.concept}</strong><small>{expense.date}</small></div><strong>{money(Number(expense.amount))}</strong><button className="cancel-action" onClick={() => onDelete(expense.id)} aria-label={`Eliminar gasto ${expense.concept}`}><Trash2 size={16} /></button></div>) : <div className="sales-empty">No hay gastos registrados para esta fecha.</div>}</section></section></>;
}

function SalesView({ orders, menu, expenses, onExport }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [sortBy, setSortBy] = useState('recent');
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(true);
  const [showPaymentBreakdown, setShowPaymentBreakdown] = useState(true);
  const todayOrders = orders.filter((order) => order.date === selectedDate);
  const todayExpenses = expenses.filter((expense) => expense.date === selectedDate);
  const totalRegistered = todayOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const deliveredOrders = todayOrders.filter((order) => order.status === 'done');
  const totalCollected = deliveredOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const averageTicket = todayOrders.length ? totalRegistered / todayOrders.length : 0;
  const totalExpenses = todayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const netProfit = totalCollected - totalExpenses;
  const paymentTotals = deliveredOrders.reduce((summary, order) => {
    const method = paymentMethods[order.paymentMethod] || 'Sin registrar';
    summary[method] = (summary[method] || 0) + orderTotal(order);
    return summary;
  }, {});
  const topProductEntries = Object.entries(todayOrders.flatMap((order) => order.products).reduce((summary, item) => {
    summary[item.name] = (summary[item.name] || 0) + item.quantity;
    return summary;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const categoryTotals = todayOrders.flatMap((order) => order.products).reduce((summary, item) => {
    const category = categoryFor(item, menu);
    summary[category] = (summary[category] || 0) + item.price * item.quantity;
    return summary;
  }, {});
  const sortedOrders = [...todayOrders].sort((a, b) => {
    if (sortBy === 'highest') return orderTotal(b) - orderTotal(a);
    if (sortBy === 'lowest') return orderTotal(a) - orderTotal(b);
    const timeA = String(a.time || '');
    const timeB = String(b.time || '');
    return sortBy === 'oldest' ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
  });
  return <><header className="topbar"><div><p className="eyebrow">RESUMEN DEL DÍA</p><h1>Ventas</h1></div><div className="export-actions"><label className="date-filter">Fecha<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label><button className="secondary-button export-button" onClick={() => onExport('csv', selectedDate)}><Download size={16} /> Descargar CSV</button><button className="primary-button" onClick={() => onExport('json', selectedDate)}><Download size={16} /> Exportar cuentas</button></div></header><section className="summary-grid sales-summary"><SummaryCard icon={<BarChart3 />} label="Venta registrada" value={money(totalRegistered)} tone="purple" /><SummaryCard icon={<Check />} label="Venta entregada" value={money(totalCollected)} tone="green" /><SummaryCard icon={<ClipboardList />} label="Cuentas del día" value={todayOrders.length} tone="orange" /><SummaryCard icon={<ReceiptIcon />} label="Ticket promedio" value={money(averageTicket)} tone="red" /><SummaryCard icon={<Wallet />} label="Gastos" value={money(totalExpenses)} tone="red" /><SummaryCard icon={<BarChart3 />} label="Utilidad neta" value={money(netProfit)} tone="green" /></section><section className="sales-category-panel sales-panel"><div className="sales-panel-header collapsible-header"><div><p className="eyebrow">VENTA POR CATEGORÍA</p><h2>Desglose por tag</h2><span>El total general incluye todas las categorías.</span></div><button className="collapse-button" onClick={() => setShowCategoryBreakdown((current) => !current)} aria-label={showCategoryBreakdown ? 'Ocultar desglose por categoría' : 'Mostrar desglose por categoría'}>{showCategoryBreakdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></div>{showCategoryBreakdown && <div className="category-sales-grid">{categories.map((category) => <div className="category-sale-card" key={category}><span className={`category-tag ${categoryClass(category)}`}>{category}</span><strong>{money(categoryTotals[category] || 0)}</strong></div>)}</div>}</section><section className="sales-panel payment-sales-panel"><div className="sales-panel-header collapsible-header"><div><p className="eyebrow">VENTA POR MÉTODO DE PAGO</p><h2>Desglose de cobros</h2><span>Solo incluye comandas marcadas como entregadas.</span></div><button className="collapse-button" onClick={() => setShowPaymentBreakdown((current) => !current)} aria-label={showPaymentBreakdown ? 'Ocultar desglose por pago' : 'Mostrar desglose por pago'}>{showPaymentBreakdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></div>{showPaymentBreakdown && <div className="category-sales-grid">{Object.entries(paymentMethods).map(([key, label]) => <div className="category-sale-card" key={key}><span className="payment-tag">{label}</span><strong>{money(paymentTotals[label] || 0)}</strong></div>)}</div>}</section><section className="sales-dashboard-grid"><section className="sales-panel top-products-panel"><div className="sales-panel-header"><div><p className="eyebrow">PRODUCTOS MÁS VENDIDOS</p><h2>Top 10</h2></div></div><div className="top-products-list">{topProductEntries.length ? topProductEntries.map(([name, quantity], index) => <div className="top-product-row" key={name}><strong>{index + 1}</strong><span>{name}</span><em>{quantity} vendidos</em></div>) : <div className="sales-empty">Todavía no hay productos vendidos.</div>}</div></section><section className="sales-panel"><div className="sales-panel-header"><div><p className="eyebrow">CUENTAS REGISTRADAS</p><h2>Resumen de comandas</h2><span>Los datos permanecen guardados; exporta una copia cuando la necesites.</span></div><div className="sales-controls"><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Ordenar ventas"><option value="recent">Más recientes</option><option value="oldest">Más antiguas</option><option value="highest">Mayor a menor total</option><option value="lowest">Menor a mayor total</option></select><strong>{new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })}</strong></div></div><div className="sales-table"><div className="sales-row sales-table-head"><span>Comanda</span><span>Mesa / cliente</span><span>Estado / pago</span><span>Total</span></div>{sortedOrders.length ? sortedOrders.map((order) => <div className="sales-row" key={order.id}><span>#{order.id}<small>{order.time}</small></span><span><strong>{order.table}</strong><small>{order.customer}</small></span><span><em className={`status-pill ${statuses[order.status].color}`}>{statuses[order.status].label}</em><small>{paymentMethods[order.paymentMethod] || (order.status === 'done' ? 'Sin registrar' : 'Pendiente')}</small></span><strong>{money(orderTotal(order))}</strong></div>) : <div className="sales-empty">No hay ventas registradas para hoy.</div>}</div></section></section></>;
}

function ReceiptIcon() {
  return <ClipboardList />;
}

function SummaryCard({ icon, label, value, tone }) { return <div className="summary-card"><div className={`summary-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>; }

createRoot(document.getElementById('root')).render(<App />);

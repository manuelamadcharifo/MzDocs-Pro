document.addEventListener('click', e => {
  const btn = e.target.closest('button,a');
  if(btn){
    btn.style.opacity = "0.7";
    setTimeout(()=>btn.style.opacity="",150);
  }
});

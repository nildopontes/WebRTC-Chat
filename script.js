'use strict';
const drone = new ScaleDrone('OOgX7u3om3pEfCPf');
var username = localStorage.getItem('username');
if(username === null){
   setUserName();
}
// Nome da sala deve ser precedido de 'observable-'
const roomName = 'observable-nildopontes';
const configuration = {
   iceServers: [{
      urls: 'stun:stun.l.google.com:19302'
   }]
};
var room;
document.addEventListener('DOMContentLoaded', function(){
   var hBox = window.innerHeight;
   document.body.style.height = `${hBox}px`;
   document.body.style.visibility = `visible`;
   newMsg.addEventListener('keypress', function(event){
      if(event.key === 'Enter') {
         sendData();
      }
   });
   onLog(`Documento carregado`);
});
// [{id:'string', pc: new RTCPeerConnection(configuration), dc: rtcp.createDataChannel('dc', iptions)},...]
var clients = [];

// Escreve no console
function onLog(msg){
   console.log(`${msg}\n`);
}

function setUserName(){
   var name = prompt('Escolha um nome de usuário');
   if(name === null || name.length == 0){
      if(username === null || username.length == 0){
         username = 'Anônimo';
      }
   }else{
      username = name;
   }
   localStorage.setItem('username', username);
}

// Exibe a mensagem enviada ou recebida
function showMessage(author, message){
   var msgParse = JSON.parse(message);
   var currentTime = new Date();
   var msg =
      `<div class="msg ${author}">
          <div class="username">${msgParse.username.replaceAll('<', '&lt;').replaceAll('>', '&gt;').slice(0, 16)}</div>
          <div class="content">${msgParse.content.replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>
          <div class="time">${('0' + currentTime.getHours()).slice(-2)}:${('0' + currentTime.getMinutes()).slice(-2)}</div>
       </div>`;
   messages.innerHTML += msg;
   var msgList = document.querySelectorAll('div.msg');
   msgList[msgList.length-1].scrollIntoView();
}
function sendData(){
   const data = newMsg.value.trim();
   if(data.length == 0){
      newMsg.value = '';
      return;
   }
   newMsg.value = '';
   newMsg.focus();
   var message = JSON.stringify({
      'username': username,
      'content': data
   });
   clients.forEach(client => {
      client.dc.send(message);
   });
   showMessage('me', message);
   onLog(`Mensagem enviada: ${data}`);
}
function addMember(id){
   clients.push({id: id, pc: new RTCPeerConnection(configuration)});
   clients.forEach(client => {
      if(client.id === id){
         // Envia um novo 'candidate' local descoberto para os membros na sala
         client.pc.onicecandidate = event => {
            if(event.candidate){
               onLog(`Candidate enviado pelo cliente ${client.id}`);
               sendMessage({'candidate': event.candidate}, client.id);
            }
         };
         client.dc = client.pc.createDataChannel(`_${client.id}`, {negotiated: true, id: 0});
         client.dc.onmessage = (event) => {
            showMessage('other', event.data);
         };
      }
   });
}
drone.on('open', error => {
   if(error){
      onLog(error);
      return;
   }
   room = drone.subscribe(roomName);
   room.on('open', error => {
      if(error){
         onLog(error);
      }
   });
   // Evento que dispara somente 1 vez ao entrar na sala. Retorna os membros online
   room.on('members', members => {
      onLog(`Entrei na sala com id ${drone.clientId}. Usuarios online: ${(members.length-1)}`);
      if(members.length == 1){
         memberOn.innerHTML = 'Sala vazia';
      }else{
         memberOn.innerHTML = `${members.length - 1} usuários online`;
      }
      localStorage.setItem('members', members.length);
      if(members.length > 1){
         members.forEach(member => {
            if(member.id != drone.clientId){
               addMember(member.id);
               onLog(`Cliente com id ${member.id} presente na sala, foi adicionado à lista local`);
            }
         });
      }
      startWebRTC(members.length);
   });
   // Adiciona à lista um usuário que acabou de entrar na sala
   room.on('member_join', member => {
      onLog(`Um membro novo entrou com id ${member.id}`);
      addMember(member.id);
      localStorage.setItem('members', parseInt(localStorage.getItem('members'), 10) + 1);
      memberOn.innerHTML = `${localStorage.getItem('members')} usuários online`;
   });
   // Exclui da lista o usuário que acabou de sair da sala
   room.on('member_leave', member => {
      onLog(`Saiu um membro com id ${member.id}`);
      const index = clients.findIndex(client => client.id === member.id);
      clients.splice(index, 1);
      localStorage.setItem('members', parseInt(localStorage.getItem('members'), 10) - 1);
      memberOn.innerHTML = `${localStorage.getItem('members')} usuários online`;
   });
});

// Envia uma mensagem pelo servidor de sinalização para os membros na sala
function sendMessage(message, destinyId){
   if(destinyId == '') return;
   message.destiny = destinyId;
   onLog(`Enviando para ${message.destiny}`);
   drone.publish({
      room: roomName,
      message
   });
}
function startWebRTC(qtdMembers){
   onLog(`startWebRTC(${qtdMembers})`);
   // Se é o segundo usuário por diante oferece a conexão aos usuários online
   if(qtdMembers > 1){
      clients.forEach(client => {
         client.pc.createOffer()
                .then(offer => client.pc.setLocalDescription(offer))
                .then(() => {
                   sendMessage({'sdp': client.pc.localDescription}, client.id);
                   onLog(`SDP enviado pelo cliente ${client.id}`);
                }).catch(err => onLog(err));
      });
   }
   // Evento disparado sempre que chega uma nova mensagem do servidor de sinalização
   room.on('data', (message, client) => {
      if(message.destiny != drone.clientId) return;
      const index = clients.findIndex(member => member.id === client.id);
      if(message.sdp){ // Mensagem é uma descrição da sessão remota
         onLog(`SDP recebido de ${client.id}`);
         clients[index].pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
            // Respondemos a mensagem com nossos dados
            if(clients[index].pc.remoteDescription.type === 'offer'){
               clients[index].pc.createAnswer().then((offer) => clients[index].pc.setLocalDescription(offer)).then(() => {
                  sendMessage({'sdp': clients[index].pc.localDescription}, clients[index].id); onLog(`SDP enviado ao cliente ${clients[index].id}`);}).catch((err) => {
                  onLog(err);
               });
            }
         }, onLog);
      }else if(message.candidate){ // Mensagem é um candidate ICE
         onLog(`Candidate recebido de ${client.id}`);
         // Adiciona à conexão local o novo ICE candidate recebido da conexão remota
         clients[index].pc.addIceCandidate(message.candidate).catch(err => onLog(err));
      }
   });
}

function fileOnChange(event){
	var self = this;
	var file = event.target.files[0];
	var mime="you open "+file.name+" it's type is "+file.type;
	var attr='';
	var reader = new FileReader();
	reader.onload = function(event){
		var bytes = this.result;
		if(! file.type.match("image/jpeg")) return;
		//draw the origin image
//		document.getElementById("ContainerImage").src=arrayBufferToURI(bytes);
		//parse the depth file
		var depthreader = new DepthReader();
		depthreader.parseFile(bytes)
		.then(function(depthreader){
			if(!depthreader.depth.data){
				alert("Oh, that's not a depth image");
				return;
			}
			attr=logAttr(depthreader).str;
			self.props.FileChange({mime: mime, attr: attr});
			var reference = new Image();
			var depth = new Image();
			reference.src = depthreader.image.data;
			var GridList = document.getElementById('InnerImageList');
			GridList.style.height=reference.height;
			dealCanvas("reference",reference);
			if(depthreader.isXDM)
				depthreader.normalizeDepthmap(64);
			depth.src = depthreader.depth.data;
			dealCanvas("depth",depth);
		});
	}
	reader.readAsArrayBuffer(file);
	return {mime: mime, attr: attr};
}

/*
function arrayBufferToURI(bytes){
	var data = new Uint8Array(bytes);
	//the data is too long to use this method
//	return "data:image/jpeg;base64,"+btoa(String.fromCharCode.apply(null,data));
	var base64='';
	var len = data.length, index = 0;
	for(;index<len;index+=3)
		base64+=btoa(String.fromCharCode.apply(null,data.slice(index,index+3)));
	return "data:image/jpeg;base64,"+base64;
}
*/

function dealCanvas(canvas_id, image){
	var canvas = document.getElementById(canvas_id);
	canvas.ctx = canvas.getContext("2d");
	canvas.width = image.width;
	canvas.height = image.height;
	canvas.ctx.drawImage(image,0,0);
	var isJPEG = (image.src.indexOf("jpeg")>-1 ? true : false);
	var encoded = base64ToUint8(image.src,isJPEG);
	var data = getDecodeData(encoded,isJPEG);
	canvas.addEventListener("mousemove",getMouseMove(data));
	canvas.addEventListener('mouseout',function(){document.getElementById('rgba').textContent='';});
}

//decode the base64 encoded image data to Uint8Array
function base64ToUint8(base64,isJPEG){
	var start = (isJPEG ? 23 : 22);
	var stringData = atob(base64.substring(start));
	var len = stringData.length;
	var data = new Uint8Array(len);
	for(var i=0; i<len; i++)
		data[i]=stringData.charCodeAt(i);
	console.log('extract encode date done');
	return data;
}

function getDecodeData(encoded, isJPEG){
	if(isJPEG)
		return decode(encoded);
	var imageData = {
		width:0,
		height:0,
		data:null
	}
	var pngreader = new PNGReader(encoded);
	pngreader.parse(function(err,png){if(err) throw err;});
	imageData.width = pngreader.png.width;
	imageData.height = pngreader.png.height;
	imageData.data = pngreader.png.pixels;
	console.log('decode done');
	return imageData;
}

function getMouseMove(imagedata){
	console.log('onmousemove');
	return function(event){
		var x = event.pageX-this.offsetLeft;
		var y = event.pageY-this.offsetTop;
		var data = this.ctx.getImageData(x,y,1,1).data;
		var rgba = "rgba("+data[0]+","+data[1]+","+data[2]+","+data[3]+")";
		var start = y*imagedata.width*4+x*4;
		var another = imagedata.data.slice(start,start+4);
		var b = document.getElementById('rgba');
		b.style.border='thin solid rgb(0,0,0)';
		b.style.background='rgba(255,255,255,255)';
		b.style.left=''+(event.pageX+5)+'px';
		b.style.top=''+event.pageY+'px';
		b.textContent="("+x+","+y+")"+rgba+another;
	}
}

function logAttr(reader){
//	var p = document.getElementById('attr');
//	p.innerHTML='';
	var p = {str: ''};
	if(reader.isXDM)
		delete(reader.focus);
	else
		delete(reader.perspective);
	for(var i in reader){
		if(reader.hasOwnProperty(i)){
			logObj(i, reader[i],0,p);
		}
	}
	return p;
}

function logObj(name, value,layer,p){
	if(name=="data") return;
	var indent='';
	for(var i=0; i<layer*4; i++) indent+='&nbsp';
	if(typeof value != "object") {
		p.str+=(indent+name + ": " + value+"<br />");
		return;
	}
	p.str+=(indent+name + ":"+"<br />");
	++layer;
	for(var i in value) logObj(i, value[i],layer,p);
}

module.exports=fileOnChange;

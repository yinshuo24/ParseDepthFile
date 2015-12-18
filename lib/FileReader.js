function fileOnChange(event){
	var self = this;
	var file = event.target.files[0];
	var mime="you open "+file.name+" it's type is "+file.type;
	self.props.FileChange({mime: mime});
	var reader = new FileReader();
	reader.onload = function(event){
		var bytes = this.result;
		if(! file.type.match("image/jpeg")) return;
		var depthreader = new DepthReader();
		depthreader.parseFile(bytes)
		.then(function(depthreader){
			afterParse(self,depthreader);
		});
	}
	reader.readAsArrayBuffer(file);
}

function imageOnClick(event, local){
	var self=this;
	var url = event.target.src;
	console.log(url);
	var reader = new DepthReader();
	reader.loadFile(url)
	.then(function(reader){
		afterParse(self,reader);
	})
	
}

function afterParse(self,depthreader){
	if(!depthreader.depth.data){
		self.props.FileChange({erroropen: true});
		return;
	}
	adjustReader(depthreader);
	self.props.FileChange({reader: depthreader});
	var reference = new Image();
	var depth = new Image();
	reference.src = depthreader.image.data;
	var GridList = document.getElementById('InnerImageList');
	GridList.style.height=reference.height;
	dealCanvas("reference",reference);
	depthreader.normalizeDepthMap({bias: 64})
	.then(function(data){depth.src=data;dealCanvas('depth',depth);});
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

function adjustReader(reader){
	if(reader.isXDM)
		delete(reader.focus);
	else
		delete(reader.perspective);
}
module.exports.fileOnChange=fileOnChange;
module.exports.imageOnClick=imageOnClick;

'use strict';

var RaisedButton = require('material-ui/lib/raised-button');
var ReactDOM = require('react-dom');
var React = require('react');
var LightRawTheme = require('material-ui/lib/styles/raw-themes/light-raw-theme');
var ThemeManager = require('material-ui/lib/styles/theme-manager');
var Card = require('material-ui/lib/card/card');
var CardHeader = require('material-ui/lib/card/card-header');
var CardText = require('material-ui/lib/card/card-text');
var CardAction = require('material-ui/lib/card/card-actions');
var CardMedia = require('material-ui/lib/card/card-media');
var CardTitle = require('material-ui/lib/card/card-title');
var Paper = require('material-ui/lib/paper');
var GridList = require('material-ui/lib/grid-list/grid-list');
var List = require('material-ui/lib/lists/list');
var ListItem = require('material-ui/lib/lists/list-item');
var fileOnChange = require('./FileReader');
let injectTapEventPlugin = require("react-tap-event-plugin");

injectTapEventPlugin();

var InputStyle = {
	bottom: "0",
	cursor: "pointer",
	left: "0",
	opacity: "0",
	position: "absolute",
	right: "0",
	top: "0",
	width: "100%"
};

var FileChooseButton = React.createClass({
	childContextTypes: {
		muiTheme: React.PropTypes.object
	},
    	getChildContext: function(){
		return {
			muiTheme: ThemeManager.getMuiTheme(LightRawTheme)
		};
	},
    	handleClick: function(e){
		console.log('clicked');
	},
    	handleChange: function(e){
		var obj = fileOnChange.bind(this)(e);
//		this.props.FileChange(obj);
	},
    	render: function(){
		return (
			<RaisedButton label='choose an Image' onClick={this.handleClick} >
				<input type='file' style={InputStyle} onChange={this.handleChange}/>
			</RaisedButton>
		);
	}
});

var HeadIntro = React.createClass({
	render: function(){
		return(
			<Card initiallyExpanded={true} >
				<CardHeader title="Depth File Parser" avatar='./avatar.jpg' actAsExpander={true} showExpandableButton={true} titleStyle={{fontSize: '25px'}}>
				</CardHeader>
				<CardText expandable={true}>
					This is the Intro of this project
					blabla
				</CardText>
				<CardAction expandable={true}>
					<FileChooseButton FileChange={this.props.onInput} />
				</CardAction>
				<CardText expandable={true}>
				{this.props.mime}
				</CardText>
			</Card>
		);
	}
});

var FileInfo = React.createClass({
	createItem: function(root, array){
		for(var i in root){
			if(! root.hasOwnProperty(i)) continue;
			if (i=='data') continue;
			if(typeof root[i] != 'object'){
				array.push(<ListItem primaryText={i+': '+root[i]} key={i} />);
				continue;
			}
			var a=[];
			this.createItem(root[i], a);
			array.push(<ListItem primaryText={i} key={i}
				initiallyOpen={true} nestedItems={a} />);
		}
	},
	dealInfo: function(){
		var a=[];
		this.createItem(this.props.reader, a);
		return a;
	},
	render: function(){
		return (
			<Card initiallyExpanded={true}>
				<CardHeader title='Depth File Info' avatar='./avatar.jpg' actAsExpander={true} 
					showExpandableButton={true} titleStyle={{fontSize: '20px'}}>
				</CardHeader>
				<List>
					<ListItem primaryText='Image Info' initiallyOpen={true}
					nestedItems={this.dealInfo()} />
				</List>
			</Card>
		);
	}
});

var InnerImagePaper = React.createClass({
	render: function(){
		return (
			<Paper zDepth={2} style={{padding: '4px'}}>
			  <GridList id='InnerImageList'>
			    <CardMedia overlay={<CardTitle title='Reference Image' />} >
			      <canvas id='reference' width='0' height='100'></canvas>
			    </CardMedia>
			    <CardMedia overlay={<CardTitle title='Depth Image' />} >
			      <canvas id='depth' width='0' height='100'></canvas>
			    </CardMedia>
			  </GridList>
			</Paper>
		);
	}
});

var ContainerImageCard = React.createClass({	
	render: function(){
		return (
			<Card>
			  <CardHeader title='ContainerImage' subtitle='subtitle'>
			  </CardHeader>
			  <CardMedia>
			    <img id='ContainerImage' />
			  </CardMedia>
			</Card>
		);
	}
});

var Page = React.createClass({
	getInitialState: function(){
		return {mime:'', reader: {}};
	},
	handleStateChange: function(obj){
		this.setState({mime: obj.mime, reader: obj.reader});
	},
	render: function(){
		return(
			<div >
			  <Paper style={{padding: '4px'}}>
			    <HeadIntro mime={this.state.mime} onInput={this.handleStateChange}/>
			  </Paper>
			  <Paper style={{padding: '4px'}}>
			    <FileInfo reader={this.state.reader}/>
			  </Paper>
			  <Paper style={{padding: '4px'}}>
			    <InnerImagePaper />
			  </Paper>
			</div>
		);
	}
});

ReactDOM.render(
	<Page />,
	document.getElementById('content')
	);